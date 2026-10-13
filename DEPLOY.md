# Deploying to Vercel

The app is two Vercel projects built from this one repo:

| Part | Folder | Vercel project |
|---|---|---|
| React frontend | `vit-hostel/` | e.g. `vit-hostel` |
| Express API | `backend/` | e.g. `vit-hostel-api` |

Data lives in MongoDB Atlas (free tier).

## 1. Create the database (MongoDB Atlas)

The old cluster (`vithostel.qouumxh.mongodb.net`) no longer exists, so make a new one.

1. Go to <https://cloud.mongodb.com>, then **Create** a cluster. Pick the **free (M0)** tier and any nearby region, such as Mumbai.
2. **Database Access → Add New Database User.** Choose username + password, role "Read and write to any database".
3. **Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`).** This is needed because Vercel's IPs change.
4. **Connect → Drivers.** Copy the connection string and put your password in it. Then add the database name `vithostel` after `.net/`:
   ```
   mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/vithostel?retryWrites=true&w=majority
   ```

## 2. Push the code to GitHub

The code is on the `vercel-backend` branch. Push it, then either merge it into `main` or follow the note in step 5.

## 3. Deploy the API

1. <https://vercel.com/new>, then import `akshiittt/vit-hostel-complaint-system`.
2. **Root Directory:** `backend`. **Framework Preset:** Other.
3. **Environment Variables:**
   - `MONGO_URI`: the string from step 1
   - `JWT_SECRET`: a long random string. Generate one with:
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `ALLOWED_ORIGINS`: `http://localhost:5173` for now. You'll update it in step 5.
4. Deploy. Then open `https://<api-project>.vercel.app/api/health`. It should show `{"status":"ok"}`.

## 4. Deploy the frontend

1. <https://vercel.com/new>, then import the same repo again.
2. **Root Directory:** `vit-hostel`. **Framework Preset:** Vite.
3. **Environment Variable:** `VITE_API_URL` = `https://<api-project>.vercel.app` (no trailing slash).
4. Deploy.

## 5. Connect the two

1. In the **API** project: Settings → Environment Variables. Set `ALLOWED_ORIGINS` to
   `https://<frontend-project>.vercel.app,http://localhost:5173`
2. Deployments → ⋯ → **Redeploy**. Environment-variable changes only apply after a redeploy.

> **Preview deployments:** every non-production push gets its own URL, such as `vit-hostel-git-xyz-akshiittt.vercel.app`. The API only accepts the exact origins in `ALLOWED_ORIGINS`, so a preview frontend can't reach the API. That's intentional. To test a preview, temporarily add its URL to `ALLOWED_ORIGINS` and redeploy the API.

> **Branch note:** Vercel deploys the repo's default branch (`main`) to production. If you don't want to merge yet, go to each project → Settings → Git → **Production Branch** and set it to `vercel-backend`.

## 6. Create the warden account

Students sign up on the website. The warden account is created from your laptop:

```bash
cd backend
cp .env.example .env     # then fill in MONGO_URI and the SEED_WARDEN_* values
npm install
npm run seed
```

`SEED_WARDEN_PASSWORD` is **required** (at least 8 characters) for any non-local database. The script refuses to run without it. Only a `localhost` MongoDB falls back to the demo password `warden1234`. Running the seed again updates the existing warden's name and password. It refuses to touch an existing *student* account that uses the same email.

## Security notes

- **Rate limiting** is built into the API. Counts are stored in MongoDB (collection `ratelimits`), so all Vercel instances share them:
  - login: 10 attempts per 15 minutes per email + IP, and 50 per 15 minutes per IP
  - register: 10 per hour per IP

  Blocked requests get HTTP 429 with a `Retry-After` header. For extra protection you can also add a rule under Vercel → Firewall, but it isn't required.
- **Missing config:** if `MONGO_URI` or `JWT_SECRET` is missing, every `/api` call returns 500 "Server is not configured correctly", and `/api/health` returns 503 with the names of the missing variables. Check `/api/health` first whenever something looks broken after a deploy.

## Running locally

```bash
# terminal 1
cd backend && cp .env.example .env   # fill in MONGO_URI + JWT_SECRET
npm install && npm run dev           # http://localhost:5000

# terminal 2
cd vit-hostel && npm install && npm run dev   # http://localhost:5173
```

Run the backend tests with `cd backend && npm test`. They use a temporary in-memory database and never touch Atlas.

## API reference

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/api/auth/register` | anyone | Student sign-up → `{ token, user }` |
| POST | `/api/auth/login` | anyone | Email + password → `{ token, user }` |
| GET | `/api/auth/me` | logged in | Current user |
| POST | `/api/complaints` | student | Submit complaint |
| GET | `/api/complaints/mine` | student | Own complaints |
| GET | `/api/complaints` | warden | All complaints, urgent first |
| PATCH | `/api/complaints/:id` | warden | `{ status: "Pending" \| "In Progress" \| "Completed" }` |
| GET | `/api/health` | anyone | Health check |

Send the token as `Authorization: Bearer <token>`.
