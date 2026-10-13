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
   - `ALLOWED_EMAIL_DOMAINS` (recommended): `vitstudent.ac.in`, so only university emails can sign up. Leave it empty to allow any email.
4. Deploy. Then open `https://<api-project>.vercel.app/api/health`. It should show `{"status":"ok","db":"ok"}`. `"db":"unreachable"` means Atlas isn't reachable: check `MONGO_URI` and Atlas Network Access.
   `vercel.json` pins the framework to "Other", so Vercel always runs `api/index.js`.

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

`SEED_WARDEN_PASSWORD` is **required** (at least 12 characters) for any non-local database. The script refuses to run without it. Only a `localhost` MongoDB falls back to the demo password `warden1234`. Running the seed again updates the existing warden's name and password. It refuses to touch an existing *student* account that uses the same email.

## Security notes

- **Rate limiting** is built into the API. Counts are stored in MongoDB (collection `ratelimits`), so all Vercel instances share them:
  - login: 10 attempts per 15 minutes per email + IP, and 30 per hour per account from any number of IPs. Together these stop password guessing, including attacks spread across many machines.
  - login: 300 per 15 minutes per IP, and register: 100 per hour per IP. These are deliberately generous, because hostel WiFi puts many students behind one shared IP.
  - complaints: 10 per hour per student, at most 3 marked urgent per day. The same description repeated within 10 minutes is rejected as a duplicate (409).
  - password resets: 20 per hour per warden.

  Blocked requests get HTTP 429 with a `Retry-After` header. For extra protection you can also add a rule under Vercel → Firewall, but it isn't required.
  The client IP comes from `X-Forwarded-For` **only on Vercel**, which sets the `VERCEL` variable and overwrites that header. Hosted anywhere else, the header is ignored, so it can't be spoofed to dodge the limits.
- **Passwords:** students need at least 8 characters, and very common passwords are rejected. The warden password set by `npm run seed` needs at least 12.
- **Logs:** one JSON line per request (method, path, status, ms, user id) plus `login`, `login_failed`, `password_changed`, `password_reset` and `db_unavailable` events, in Vercel → Logs. Request bodies, passwords, tokens and temporary passwords are never logged. Set `LOG_LEVEL=silent` to turn logging off.
- **Sessions:** login tokens last 1 day. **Logout ends the session on the server** (on every device). Passwords use bcrypt cost 12, and older hashes are upgraded at the next login.
- **Frontend security headers** (`vit-hostel/vercel.json`): Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy. The CSP only allows API calls to `https://vit-hostel-complaint-system.vercel.app`. **If your API domain changes, update `connect-src` in that file**, or the site can't reach the API.
- **Warden resets** record `passwordResetAt` and `passwordResetBy` on the student, and the student sees when the reset happened.
- **Database outage:** API calls return 503 "The service is temporarily unavailable" with `Retry-After: 30` within about 5 s, instead of a generic error.
- **Forgotten passwords:** there's no email reset yet. The warden uses "Reset a student's password" in the warden panel and gives the student the temporary password privately. To change the warden's own password, use "Change password" in the app, or re-run `npm run seed`.
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

| Method | Path | Who | What | Status codes |
|---|---|---|---|---|
| POST | `/api/auth/register` | anyone | Student sign-up → `{ token, user }` | 201; 400 invalid input, weak password, bad reg number or email domain; 409 email or reg number taken; 429 |
| POST | `/api/auth/login` | anyone | Email + password → `{ token, user }` | 200; 400; 401 wrong email/password; 429 |
| POST | `/api/auth/logout` | logged in | Ends all of the user's sessions (bumps tokenVersion) | 204; 401 |
| GET | `/api/auth/me` | logged in | Current user (`mustChangePassword`, `passwordResetAt`) | 200; 401 |
| POST | `/api/auth/change-password` | logged in | `{ currentPassword, newPassword }` → new `{ token, user }`; logs out other sessions | 200; 400 (incl. wrong current password); 401; 429 |
| POST | `/api/auth/reset-password` | warden | `{ email }` → `{ email, temporaryPassword }`; student must change it at next login | 200; 400; 401; 403 not a warden; 404 no such student; 429 |
| POST | `/api/complaints` | student | Submit complaint | 201; 400; 401; 403 role or password change pending; 409 duplicate; 429 |
| GET | `/api/complaints/mine` | student | Latest 100 of the student's own complaints | 200; 401; 403 |
| GET | `/api/complaints?status=&page=&limit=` | warden | Paged list, urgent first, with `counts` | 200; 400 bad filter; 401; 403 |
| PATCH | `/api/complaints/:id` | warden | `{ status: "Pending" \| "In Progress" \| "Completed" }` | 200; 400; 401; 403; 404 |
| GET | `/api/health` | anyone | DB ping. Lists the names of missing env vars, never their values (a deliberate trade-off for debugging deploys) | 200; 503 |

Any `/api` call can also return 500 (unexpected error, generic message) or 503 + `Retry-After` (database unreachable). Errors are always JSON `{ message }`.

Send the token as `Authorization: Bearer <token>`.
