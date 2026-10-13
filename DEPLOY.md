# Deploying to Vercel

The app is two Vercel projects built from this one repo:

| Part | Folder | Vercel project |
|---|---|---|
| React frontend | `vit-hostel/` | e.g. `vit-hostel` |
| Express API | `backend/` | e.g. `vit-hostel-api` |

Data lives in MongoDB Atlas (free tier).

## 1. Create the database (MongoDB Atlas)

The old cluster (`vithostel.qouumxh.mongodb.net`) no longer exists, so make a new one.

1. Go to <https://cloud.mongodb.com>, then **Create** a cluster. Pick the **free (M0)** tier and a region near your users, such as Mumbai. The API's Vercel region (`regions` in `backend/vercel.json`, currently `bom1` Mumbai) should match it.
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
   It also pins the function region to **`bom1` (Mumbai)**, next to the Atlas cluster. If your cluster is in a different region, change `regions` to match (see [Performance](#performance)).

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

## Database maintenance

- **After any deploy that adds or changes an index, run `npm run db:indexes`.** Vercel freezes the function right after each response, so Mongoose's automatic background index build often doesn't finish in production (this happened with the status index on 2026-10-13).
- Mongoose still tries to create indexes automatically the first time the API uses each collection. A failure (e.g. a unique index blocked by duplicates) shows up as an `index_error` line in Vercel → Logs.
- To create missing indexes explicitly, run this from `backend/`:
  ```bash
  npm run db:indexes
  ```
  It only **adds** indexes and never drops indexes or data. If your network's DNS blocks `mongodb+srv` lookups, prefix it with `DNS_SERVERS=8.8.8.8,1.1.1.1`.
- **Backups:** none, by decision (2026-10-13). The free Atlas tier has no automatic snapshots, so deleted or corrupted data can't be recovered. Be extra careful with any command that writes to production. Revisit in a future update (see CLAUDE.md → D2).
- Complaints keep a `statusHistory` (status, warden, time). Two wardens changing the same complaint at once: the second gets a 409 and sees the refreshed list.

## Release checklist

Go through this before promoting anything to production (that is, before pushing or merging to `main`).

**Before deploying**

- [ ] Tests pass locally: `cd backend && npm test` and `cd vit-hostel && npm test`.
- [ ] The frontend builds: `cd vit-hostel && npm run build`.
- [ ] CI is green on the commit you're shipping (GitHub → Actions).
- [ ] Every environment variable the change needs exists in **both** Vercel projects' Production environment (see [Environment variables](#environment-variables)). New or changed variables only take effect after a redeploy.
- [ ] If the API URL changed: update `VITE_API_URL` in the frontend project **and** `connect-src` in `vit-hostel/vercel.json`. If the frontend URL changed: update `ALLOWED_ORIGINS` in the API project.
- [ ] Any schema change is additive only (new optional fields with defaults, new indexes). See the migration rules in CLAUDE.md.

**Deploy order**

- If the change touches the API contract (new or changed routes, fields or status codes), deploy the **backend first**, check `/api/health`, then deploy the frontend. The old frontend keeps working against the new API, but a new frontend against the old API may not.
- Frontend-only or backend-only changes can go on their own.

**Right after deploying**

- [ ] If the release added or changed an index: `cd backend && npm run db:indexes` (see [Database maintenance](#database-maintenance)).
- [ ] `/api/health` returns `{"status":"ok","db":"ok"}`.
- [ ] Log in on the live site as a student and as the warden. The dashboards load, and a status change saves.
- [ ] Browser DevTools → Console shows no CSP violations or failed requests.
- [ ] The response headers look right (commands under [Verify after a deploy](#verify-after-a-deploy)): security headers on every path, `immutable` only on `/assets/*`.
- [ ] Vercel → API project → Logs show no new `index_error`, `db_unavailable` or 500s.

## Rollback

**Fastest (no code change): Vercel Instant Rollback.** For each affected project: Vercel → Project → **Deployments** → find the previous deployment marked **Ready** in **Production** → ⋯ → **Instant Rollback**. On some plans the menu says **Promote to Production**. This reuses that deployment's build, so it takes seconds. Roll back the frontend and backend separately. If a release changed the API contract, roll back the **frontend first**, then the backend.

Things to know:
- On the Hobby plan you can only roll back to the deployment that was in production **immediately before** the current one. To go further back, use **Promote to Production** on an older Ready deployment, or the git route below.
- After an Instant Rollback, Vercel stops auto-promoting new pushes to production until you promote a deployment again. Remember to undo this once the fix is in.
- **Environment variables are not rolled back in the dashboard, but the old deployment uses its own.** Every deployment keeps the env var values it was built with. A rollback therefore runs with the **old** values, while Settings still shows the new ones. Don't roll back blindly past an env var change. Example: rolling the API back to a deployment from before the `MONGO_URI` switch to `vithostel-app` would use the old (deleted) database user and break the DB connection. If an env var change caused the problem, fix the variable in Settings → Environment Variables and **redeploy** instead.

**Through git:** `git revert <bad-commit>` on `main` and push. Vercel builds and deploys the revert like any other commit. Use this to make the rollback permanent after an Instant Rollback, so the next push doesn't bring the bug back.

**Database:** schema changes in this project are additive only (new optional fields and new indexes), so running older code against the current database is safe. Older code just ignores the new fields. **There are no backups** (Atlas M0, see [Database maintenance](#database-maintenance)), so a code rollback can't undo data a bad release wrote or deleted. Never try to "roll back" data with `deleteMany`, `dropDatabase` or `syncIndexes`.

**Config files:** rolling back also rolls back `vercel.json` (headers, region). If the bad release was a CSP change that blocks the API, rolling back the frontend fixes it straight away.

## Environment variables

Set them in Vercel → Project → Settings → Environment Variables (Production), or in `backend/.env` / `vit-hostel/.env` locally (copy the `.env.example` files). Never commit real values.

**API project (`backend/`)**

| Name | Required? | Where it's used | Notes / example |
|---|---|---|---|
| `MONGO_URI` | **Yes** | `lib/db.js`, seed, scripts | `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/vithostel?retryWrites=true&w=majority`. Use the least-privilege app user (`readWrite@vithostel`). Without it, `/api` returns 500 and `/api/health` returns 503 and names the missing variable. |
| `JWT_SECRET` | **Yes** | `lib/token.js`, `middleware/auth.js` | Long random string, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it logs everyone out. |
| `ALLOWED_ORIGINS` | **Yes** in production | CORS in `app.js` | Comma-separated exact origins, e.g. `https://<frontend>.vercel.app,http://localhost:5173`. Trailing slash and case are ignored. A frontend origin that isn't listed can't call the API. |
| `ALLOWED_EMAIL_DOMAINS` | Recommended | Registration | Comma-separated, e.g. `vitstudent.ac.in`. Empty means any email domain can sign up. |
| `LOG_LEVEL` | No | `lib/logger.js` | Only value: `silent` (turns off the JSON logs; the tests use it). Leave it unset in production so Vercel Logs keep the request and audit trail. |
| `PORT` | Local only | `server.js` | Default `5000`. Vercel ignores it. |
| `BCRYPT_ROUNDS` | **Tests only** | `lib/passwordPolicy.js` | Tests set `4` for speed. **Never set it in production**: the default is 12, and a lower value weakens every new password hash. |
| `DNS_SERVERS` | Scripts only | `npm run db:indexes` / seed (local) | e.g. `8.8.8.8,1.1.1.1`, when local DNS blocks `mongodb+srv` lookups. Not needed on Vercel. |
| `SEED_WARDEN_NAME`, `SEED_WARDEN_EMAIL`, `SEED_WARDEN_PASSWORD` | Seed only | `seed.js` (`npm run seed`, from your laptop) | Password: 12+ characters and required for any non-local DB. Keep `SEED_WARDEN_PASSWORD` empty in `.env` and set it only for the one command. Never add these to Vercel. |
| `VERCEL` | Set by Vercel | `app.js` (`trust proxy`) | Don't set it yourself. It tells the app that `X-Forwarded-For` is trustworthy. |

**Frontend project (`vit-hostel/`)**

| Name | Required? | Where it's used | Notes / example |
|---|---|---|---|
| `VITE_API_URL` | **Yes** in production | `src/api.js` | `https://<api-project>.vercel.app` (no trailing slash). It's **baked in at build time**, so changing it needs a redeploy. It must match `connect-src` in `vit-hostel/vercel.json`'s CSP, or the browser blocks every API call. Defaults to `http://localhost:5000`. |

## Performance

**API region.** `backend/vercel.json` sets `"regions": ["bom1"]` (Mumbai), because the Atlas cluster is in Mumbai. Every API request makes several sequential database round trips (a login does about 4: three rate-limit updates and a user lookup). With the function in Vercel's default region (`iad1`, Washington DC), each round trip crossed the world (~200+ ms), so `/api/health` took 0.5–0.9 s warm and a failed login about 1.1 s. With the function next to the database, each round trip is a few ms.
- **If you ever move the Atlas cluster to another region, change `regions` to the matching Vercel region** (e.g. Singapore → `sin1`, Frankfurt → `fra1`), or the API gets slow again.
- Trade-off: users far from India (e.g. in the US) get a little more latency on their first hop to the function. That's the right call here, because the users are in India and the database trips dominate.
- The Hobby plan allows **one** function region, which is all this needs. Vercel → API project → Settings → Functions shows the effective region. `vercel.json` takes precedence over the dashboard setting.
- Cold starts (first request after the function has been idle) still add 1–2 s: Node boots and opens a new MongoDB connection. That's expected on serverless.

**Static asset caching.** `vit-hostel/vercel.json` serves `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`. Vite gives these files content-hashed names (`index-<hash>.js`), so a new build always means new URLs, and browsers can safely keep the old ones for a year without revalidating. `index.html`, `/favicon.jpg` and every other path keep Vercel's default `max-age=0, must-revalidate`, so a new deploy shows up on the next page load. The security-headers rule (`/(.*)`) still matches `/assets/*` too: Vercel applies every matching rule, and only duplicate keys are overridden by the later rule.
- Don't put non-hashed files in `/assets/` (e.g. through `public/assets/`), or they'll be cached for a year with no way to update them.

**Images.** The logo (`src/assets/vit-logo.jpg`) is 160×160 (2× its largest display size of 80 px), and the favicon is 64×64. Don't swap in a full-size source image again.

### Verify after a deploy

Run these from any machine (Git Bash, macOS or Linux; on Windows PowerShell use `curl.exe`):

```bash
API=https://vit-hostel-complaint-system.vercel.app
FE=https://vithostelc.vercel.app

# 1. API latency: run 5 times. Ignore the first (it may be a cold start).
#    Before the region pin: 0.5–0.9 s warm. Expect roughly 0.1–0.2 s from India.
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" $API/api/health; done

# 2. Which region served it: the x-vercel-id header should contain ::bom1:: (it was ::iad1:: before)
curl -sI $API/api/health | grep -i x-vercel-id

# 3. Hashed assets are immutable and still carry the security headers
ASSET=$(curl -s $FE/ | grep -oE '/assets/index-[^"]+\.js' | head -1); echo $ASSET
curl -sI $FE$ASSET | grep -iE "cache-control|content-security-policy|x-frame-options|x-content-type-options"
#    expect: cache-control: public, max-age=31536000, immutable  (+ CSP, DENY, nosniff)

# 4. index.html and the favicon are NOT immutable
curl -sI $FE/ | grep -iE "cache-control|content-security-policy"
curl -sI $FE/favicon.jpg | grep -iE "cache-control|content-length"
#    expect: cache-control: public, max-age=0, must-revalidate (+ CSP on /); favicon about 2.5 kB
```

Then log in on the live site and check the browser console for errors.

## Public URL / custom domain

- The public site is **https://vithostelc.vercel.app** (frontend project → Settings → Domains). Share only this address.
- **Every address users open the site on must be listed in the API's `ALLOWED_ORIGINS`**, or the browser blocks API calls and the app shows "Cannot reach the server". Current value: `https://vithostelc.vercel.app,https://vit-hostel-complaint-system-bqsl.vercel.app,http://localhost:5173`.
- Deployment-specific URLs (`…-<hash>-akshit15.vercel.app`, opened by Vercel's "Visit" button) aren't allowed on purpose. Use the public URL.
- **To change the domain:** add the new one under Domains → add it to `ALLOWED_ORIGINS` → redeploy the API → update `SITE` in `.github/workflows/post-deploy.yml`. The API URL (`VITE_API_URL`, CSP `connect-src`) doesn't change.

## Continuous deployment

- **Deploys:** Vercel deploys `main` automatically for both projects. Other branches get preview URLs.
- **Before deploys:** CI (`.github/workflows/ci.yml`) runs on every push and PR.
- **After deploys:** `.github/workflows/post-deploy.yml` runs after every successful **production** deploy and checks, read-only, that `/api/health` is ok, the frontend returns 200 with a CSP, and `/api/auth/me` answers 401. A red run there means roll back (see Rollback).
- **Branch protection on `main` (enabled 2026-10-14):** pull requests require the `backend`, `frontend` and `journeys` checks, with no approvals needed. **The owner can bypass it** (a deliberate choice for a solo project), so a direct push to `main` still deploys without waiting for CI. Normal flow: push to a branch → open a PR → green checks → merge → Vercel deploys → post-deploy smoke check.

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
