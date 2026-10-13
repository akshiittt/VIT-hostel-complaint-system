# VIT Hostel Complaint System

Students submit hostel complaints. Wardens see all complaints and mark them Pending or Completed.
This is a college project, deployed on Vercel with data in MongoDB Atlas.

## Repo layout

| Path | What |
|---|---|
| `vit-hostel/` | React 18 + Vite frontend (the current app) |
| `backend/` | Express 5 + Mongoose 8 API, CommonJS, runs as a Vercel serverless function |
| `index.html`, `student.html`, `warden.html`, `script.js`, `style.css` | Legacy Review 1 HTML/CSS/JS version. Don't modify; kept for history |
| `DEPLOY.md` | Step-by-step Vercel + Atlas deployment |
| `check.md` | Senior-review checklist. Tick items off as they're fixed and verified |

Branches: `main` holds the legacy HTML version. `review-2-react` holds the React-only version. `vercel-backend` holds the backend + React integration.

## Commands

```bash
# backend (needs backend/.env, see backend/.env.example)
cd backend && npm install
npm run dev      # nodemon, http://localhost:5000
npm test         # node:test + supertest + in-memory MongoDB, never touches Atlas
npm run seed     # create the warden, or update its name/password (needs SEED_WARDEN_PASSWORD unless MONGO_URI is localhost)
npm run db:indexes  # create any missing indexes (non-destructive; DNS_SERVERS=8.8.8.8,1.1.1.1 if local DNS blocks mongodb+srv)

# frontend
cd vit-hostel && npm install
npm run dev      # http://localhost:5173, calls VITE_API_URL (default http://localhost:5000)
npm run build
```

## Backend architecture

- `app.js` builds the Express app and **does not listen**.
  - `server.js` listens (local dev only).
  - `api/index.js` re-exports the app for Vercel, and `vercel.json` rewrites every path to it.
  - Keep this split. Never call `app.listen()` or `process.exit()` from code Vercel loads.
- `lib/db.js` caches the mongoose connection promise on `global` so warm serverless instances reuse it. Routes under `/api` connect lazily through middleware in `app.js`. `/` skips the DB. `/api/health` connects and pings it, with a 5 s timeout.
- `lib/config.js` → `missingConfig()`. The `/api` middleware returns 500 "Server is not configured correctly" if `MONGO_URI` or `JWT_SECRET` is missing. `/api/health` returns 503 with the missing names (never the values).
- `lib/constants.js` is the single source for hostel blocks, complaint types, statuses, `LIMITS` (max field lengths) and `RATE_LIMITS`. `vit-hostel/src/constants.js` mirrors the blocks and types, so **change both together**.
- `lib/validation.js` has `isBlank` (also blocks NoSQL operator injection, because it requires real strings) and `tooLongMessage`. Passwords are measured in UTF-8 bytes against 72, because bcrypt ignores anything longer.
- `lib/logger.js`: `log(event, fields)` writes one JSON line (never bodies, passwords, tokens or temporary passwords). `requestLogger` logs every request, and `LOG_LEVEL=silent` turns it off (all test files set this).
- `lib/passwordPolicy.js` → `passwordProblem(pw)`: at least 8 characters, at most 72 bytes, not in the common-password list. Use it for every new password. The seed requires 12+ for the warden.
- `trust proxy` is only set when `process.env.VERCEL` is set (Vercel overwrites X-Forwarded-For). Elsewhere the header is client-controlled and must not reach `req.ip`.
- `requireReady` (config check + DB connect) is mounted per router, not on all of `/api`, so unknown paths stay 404. DB-unreachable errors become 503 + `Retry-After`, both in `requireReady` and in the error handler.
- Complaints use `optimisticConcurrency`: a `save()` on a document someone else saved since it was loaded throws `VersionError`, which app.js maps to 409. Every status change pushes `{ status, by, at }` onto `statusHistory`.
- `lib/indexes.js` logs `index_error` when an automatic index build fails and provides `ensureIndexes()` (uses `createIndexes()`). **Never use `syncIndexes()` against production: it drops indexes.** The connection pool is capped at `maxPoolSize: 10` per serverless instance (`lib/db.js`).
- Complaint creation: `validateComplaint` runs before the `complaintsPerStudent` and `urgentPerStudent` limits (so failed validation doesn't count), then the duplicate check (same student + same description within 10 min → 409).
- Warden resets set `passwordResetAt`/`passwordResetBy` and emit a `password_reset` log event. `tokenVersion` is bumped with an atomic `$inc` (`bumpTokenVersion`).
- `lib/rateLimit.js` + `models/RateLimit.js`: a fixed-window limiter whose counts live in MongoDB (with a TTL index), because Vercel instances don't share memory. It's applied to login (per IP+email and per IP) and register (per IP). `app.set('trust proxy', 1)` makes `req.ip` the client IP. Never replace it with an in-memory limiter, and never add a flag to disable it in tests (the tests drop the DB between cases instead).
- Auth: JWT (HS256) signed with `JWT_SECRET`, payload `{ id, v }`, 1-day expiry. Sent as `Authorization: Bearer <token>`. Always create tokens with `lib/token.js` → `generateToken(user)`.
  - `v` is `user.tokenVersion`. `protect` returns 401 "Session expired" when they differ. Changing or resetting a password, or `POST /api/auth/logout`, bumps it, which ends all of that user's sessions on every device.
  - Passwords are hashed with bcrypt cost `bcryptRounds()` (12). Tests set `BCRYPT_ROUNDS=4` for speed; never set it in production. Login re-hashes passwords stored at a lower cost.
  - `user.mustChangePassword` is set by a warden reset. `requirePasswordChanged` (used on every complaint route) returns 403 until the user changes their password. `/me` and change-password stay open.
  - Temporary passwords come from `lib/tempPassword.js` (crypto, unambiguous alphabet). Never log them.
- Sign-up identity: `ALLOWED_EMAIL_DOMAINS` (optional, comma-separated) restricts email domains. `regNumber` is unique among students (a partial unique index plus a route check), and the error handler maps 11000 on regNumber to a 409 with its own message.
  - `protect` loads the user and returns 401 if the token is invalid or the user is gone.
  - `allowRoles(...)` returns 403.
- Roles: `student` (self-register via `/api/auth/register`, which always forces role `student`) and `warden` (created only by `seed.js`).
- Passwords are hashed **only** by `hashPassword()` in `lib/passwordPolicy.js`. The `User` pre-save hook calls it, so always pass plain passwords to `User.create`/`save`, because hashing beforehand double-hashes and breaks login (the old backend's bug). Routes that must change the password and `tokenVersion` in **one atomic write** (change-password, reset-password) call `hashPassword()` and use `findByIdAndUpdate`/`updateOne` with `$set` + `$inc`. `password` has `select: false`, so use `.select('+password')` when you need it.
- Send users to the client via `user.toPublic()`, never as the raw document.
- Express 5 forwards rejected promises from async handlers to the error handler in `app.js`, so there's no need for try/catch per route. The error handler logs the error and returns a generic 500 message. Don't leak `error.message` to clients.
- Validation lives in the route handlers: return `400` with `{ message }` for bad input, `404` for an unknown or invalid id, `409` for a duplicate email.
- The error handler maps Mongo duplicate-key errors (`11000`) to 409. Client errors from middleware (`err.expose`, 4xx) keep their status, e.g. 413 for a body over 100 kB.
- The complaint `PATCH` sets `resolvedAt` only on a real transition to Completed and clears it otherwise. It saves with `validateModifiedOnly` so older documents that break newer length limits can still be updated.
- `seed.js` checks the password before connecting (via `lib/seedPlan.js`, which has unit tests). It never deletes users, and it refuses if the email belongs to a non-warden.

## API

| Method | Path | Role |
|---|---|---|
| POST | `/api/auth/register` | public: student sign-up → `{ token, user }`. 400 for a disallowed email domain, 409 for a duplicate email or reg number |
| POST | `/api/auth/login` | public → `{ token, user }` (`user.mustChangePassword`) |
| GET | `/api/auth/me` | any logged in |
| POST | `/api/auth/change-password` | any logged in, `{ currentPassword, newPassword }` → `{ token, user }` (new token; bumps tokenVersion) |
| POST | `/api/auth/reset-password` | warden, `{ email }` → `{ email, temporaryPassword }` (student must change it at next login) |
| POST | `/api/complaints` | student |
| GET | `/api/complaints/mine` | student (plain array) |
| GET | `/api/complaints?status=&page=&limit=` | warden → `{ complaints, page, limit, total, pages, counts: { total, open, completed } }`. `status` is all, open, Pending, In Progress or Completed; `limit` is at most 100 |
| PATCH | `/api/complaints/:id` | warden, `{ status }` |
| GET | `/api/health` | public. Pings the DB: 200 `{status:'ok',db:'ok'}`, or 503 when config is missing or the DB is unreachable |

All errors are JSON `{ message }`.

## Frontend architecture

- `src/api.js`: `apiRequest(path, { method, body })` adds the bearer token and throws `Error` with the server's `message` and a `status`. The token lives in localStorage (`vit-hostel-token`), and every storage access is wrapped in try/catch.
- `App.jsx` owns `user` and `complaints`. On load it restores the session via `/api/auth/me`, and a 401 anywhere logs the user out. Child components receive data and callbacks as props. There's no router and no global state library; keep it that way unless the app grows.
- The role comes from the server (`user.role`), never from what the user clicked.
- Session restore only clears the token on 401. On a network or server error it shows a Retry screen. `loadComplaints` uses a request-id ref so stale responses (after logout/login) are ignored. On 401, `addComplaint` logs out and resolves `false`.
- Accessibility: every field has `id` + `htmlFor` (`login-*`, `register-*`, `complaint-*`), radio groups use `<fieldset><legend>`, errors have `role="alert"` and success messages `role="status"`. Keep this for new fields; the frontend tests query by label.
- Any 401 goes through `expireSession()` in `App.jsx`, which logs out and shows "Your session expired" on the login page. The Logout buttons use `logout()`, which calls `POST /api/auth/logout` (ending the session on the server) and then clears local state, even if that request fails. `apiRequest` aborts after `REQUEST_TIMEOUT_MS` (15 s) with a friendly message.
- Both dashboards use `components/TopBar.jsx` (short title and 44 px tap targets on phones; the warden's has a skip link to `#reset-password`). Page content goes in `<main>`. Keep buttons out of `<h2>`s (use `.heading-row`).
- Forms use `noValidate` and app-side checks, and errors clear when a field changes. Status buttons are disabled while their PATCH is in flight (`updatingIds`).
- Colours: every text/background pair meets WCAG AA (4.5:1). Primary `#2563b0`, success `#1e7e45`, warning `#a35400`/`#8a4b00`, danger `#b42318`, muted text `#5f6b78`. Don't reintroduce lighter shades.
- `vit-hostel/vercel.json` rewrites every path to `index.html`, and `App.jsx` resets stray paths and hashes to `/`.
- `vit-hostel/vercel.json` also sets the security headers. The CSP's `connect-src` names the API domain, so **if the API URL changes, update it there too**, or every API call will be blocked. Don't add inline `<script>`/`<style>` or third-party assets without updating the CSP.
- Styling is plain CSS in `src/App.css`. Reuse existing classes (`panel-card`, `form-group`, `btn`, `error-msg`, `empty-msg`, `badge-*`) before adding new ones.

## Environment variables

- Backend: `MONGO_URI`, `JWT_SECRET`, `ALLOWED_ORIGINS` (comma-separated, used for CORS; trailing slash and case are ignored), `ALLOWED_EMAIL_DOMAINS` (optional), `PORT` (local only), `SEED_WARDEN_NAME`/`SEED_WARDEN_EMAIL`/`SEED_WARDEN_PASSWORD` (seed only).
- Frontend: `VITE_API_URL`. It's baked in at build time, so changing it on Vercel needs a redeploy.
- Never commit `.env` files. Keep `.env.example` files in sync when adding variables.

## Conventions

- Match the existing style: no semicolons, single quotes, 2-space indent, small focused files.
- Every backend behavior change gets a test in `backend/test/` that runs against the in-memory DB. Run `npm test` before claiming something works.
- `backend/test/constantsSync.test.js` fails if `vit-hostel/src/constants.js` (blocks, types, statuses, LIMITS) drifts from `backend/lib/constants.js`.
- CI: `.github/workflows/ci.yml` runs both test suites and the frontend build on every push and PR.
- Frontend tests: Vitest + React Testing Library (`cd vit-hostel && npm test`). Stub `fetch`, don't mock `api.js`, and query by label/role.
- For UI changes, run both dev servers and click through the flow (student sign-up → submit → warden login → change status), and check the browser console for errors.

## Project status (2026-10-13)

**Docs:** `docs/TESTING.md` (how to test, regression map, gaps), `docs/PROJECT_REVIEW.md` (scored review, blockers, interview prep).

**Live:** frontend **https://vithostelc.vercel.app** (public URL; the old `vit-hostel-complaint-system-bqsl.vercel.app` still works), API https://vit-hostel-complaint-system.vercel.app (`/api/health` → `{"status":"ok","db":"ok"}`). Atlas database `vithostel`. Vercel deploys `main`; work happens on `vercel-backend` and is fast-forwarded into `main`. Backend tests 90/90, frontend 53/53, CI green, `npm audit` 0/0.

### Done

1. **Backend built:** Express + MongoDB on Vercel serverless. Email/password auth, students and wardens, complaints.
2. **Frontend wired to the API:** React/Vite on Vercel, moved off GitHub Pages.
3. **Senior review** (check.md #1–24): config checks, rate limits, safe seed, accessible forms, Vite 6, Vitest suite.
4. **Security and bug hunt:**
   - NAT-friendly rate limits.
   - CORS origin normalisation.
   - Email trimming.
   - JWT pinned to HS256.
   - Root `node_modules` untracked.
5. **Production-readiness:**
   - Email-domain restriction and unique reg numbers.
   - Change and reset password, with forced change after a reset.
   - `tokenVersion` session revocation.
   - Health check pings the DB.
   - Warden paging, filter and counts.
   - CI on GitHub Actions.
   - README rewrite.
6. **Frontend audit:**
   - WCAG AA colours.
   - Session-expired notice.
   - Shared TopBar with mobile layout.
   - Skip link, `<main>`, buttons moved out of headings.
   - Double-submit guard and 15 s request timeout.
   - Favicon and SPA rewrite.
7. **Backend audit:**
   - Complaint, urgent and duplicate limits.
   - Per-account login limit; `trust proxy` only on Vercel.
   - Reset audit trail.
   - VIT reg-number format.
   - 503 on DB outage.
   - Password policy (8+, not common).
   - JSON request and audit logs.
   - Hardened headers.
8. **Defensive security audit:**
   - No secrets in git or the bundle.
   - Frontend CSP and security headers.
   - 1-day tokens and server-side logout.
   - bcrypt 12 with upgrade on login.
   - Dev dependencies cleaned (nodemon → `node --watch`, Vitest 5).
9. **Deployed:**
   - Atlas cluster, two Vercel projects, warden seeded, live end-to-end test passed.
   - Deploy-time fixes: env var typo `MANGO_URI` → `MONGO_URI`, `ALLOWED_ORIGINS` updated.

10. **Testing, performance and release pass (2026-10-14):**
    - **Tests:** full-stack journey tests (`npm run test:journeys`: React in jsdom + real API + in-memory MongoDB); tests for the backend error paths and the seed/index/server scripts; frontend component gaps filled; coverage scripts (backend 98.9% lines, frontend 96.1%); `docs/TESTING.md` with a regression map.
    - **Bug fixed:** a list load in flight overwrote a just-submitted complaint.
    - **Performance (deployed and verified 2026-10-14):**
      - API runs in `bom1` (`x-vercel-id: bom1::bom1`). Unknown-user login went from ~1.1 s to 0.14–0.41 s; health is 0.12–0.45 s.
      - `/assets/*` is cached as immutable, and a missing asset returns 404.
      - Logo 10.7 KB, favicon 2.6 KB.
    - **CD:** a post-deploy smoke workflow checks every production deploy (green on the first run). The CI journeys job is green on GitHub.
    - **Docs:** DEPLOY.md release checklist, rollback and env-var table; `docs/PROJECT_REVIEW.md` with scores, interview questions and decisions to explain.

### Left: owner actions (not code; see check.md)

- [x] **Database user:** the app now connects as `vithostel-app` with only `readWrite@vithostel` (verified 2026-10-13: roles, no access to `admin.system.users`, live health ok). Confirm the old `atlasAdmin` user `akshit` is deleted in Atlas → Database Access.
- [ ] Confirm the production `JWT_SECRET` is the long random value.
- [x] Old prototype `.env` deleted. [ ] Change/revoke the Gmail credential that was in it, and make sure the old DB user `akshit` is deleted (its password was in that file).
- [ ] Leave `SEED_WARDEN_PASSWORD=` **empty** in `backend/.env`. Change the warden password in the app instead. To re-run the seed, set it only for that one command (`$env:SEED_WARDEN_PASSWORD="…"` in PowerShell). With it empty, the seed stops safely before connecting.
- GitHub Pages (`gh-pages` branch, the old frontend-only React build): **kept on purpose by the owner, with no redirect** (2026-10-13). It has no backend or data, so there's no security risk. Don't delete or replace it.
- [x] Leftover `test` database: checked, there is none.

### Left: database audit improvements (prioritised; not implemented yet)

Read-only live check: users 2 (1 student, 1 warden), complaints 1. All indexes exist, there are no duplicate emails or reg numbers, no orphaned complaints, and the rate-limit TTL is in place. Password hashes are still cost 10; they upgrade to 12 at the next login.

| # | Priority | Improvement | Safest way to do it |
|---|---|---|---|
| D1 ✅ done (`vithostel-app`, `readWrite@vithostel`) | Critical | App connected as **atlasAdmin**, so a leaked `MONGO_URI` means full control of the cluster | In Atlas, create user `vithostel-app` with `readWrite@vithostel` → put its URI in Vercel `MONGO_URI` → redeploy → `/api/health` ok → only then remove admin rights from (or delete) the old user. Keep an admin user only for yourself, never in the app. |
| D2 ⏸ deferred by owner (2026-10-13: no backups for now, revisit in a future update) | High | **No backups**: Atlas M0 has no automated snapshots. The cluster's 3 copies protect against a server failing, **not** against deleted data, bad changes or bugs. Free options when revisited: an `npm run db:backup`/`db:restore` script (JSON export via the driver, restore into a scratch DB), or `mongodump`. | Before any schema or index change, and on a schedule (e.g. weekly), run `mongodump --uri <readonly-user-uri> --db vithostel`, keep it encrypted outside Dropbox, and test `mongorestore --nsFrom vithostel.* --nsTo restoretest.*` into a scratch database. Consider an Atlas Flex/M10 tier for automatic snapshots. |
| D3 ✅ done | High | Connection pool: Mongoose defaults to `maxPoolSize` 100 per serverless instance, against M0's ~500-connection cap | `lib/db.js` connect options `{ maxPoolSize: 10, minPoolSize: 0, maxIdleTimeMS: 60000 }`. Code-only, no data change. |
| D4 ✅ done | Medium | Stat-box counts (`status: 'Completed'`, `status ≠ 'Completed'`) do a **full collection scan** on every warden page load (confirmed with explain) | Add a `{ status: 1, urgent: -1, createdAt: -1 }` index. It's tiny today, so building it is instant. |
| D5 ✅ done (kept autoIndex, failures now logged, plus `npm run db:indexes`) | Medium | Indexes are built implicitly by Mongoose `autoIndex` at cold start, and failures are silent | Set `autoIndex: false` in production and add an explicit `npm run db:indexes` script using **`createIndexes()` (non-destructive)**. **Never `syncIndexes()` against production: it drops indexes not in the schema.** |
| D6 ✅ done | Medium | Password change/reset does `save()` and then `$inc tokenVersion` as two writes, so a crash in between changes the password without revoking sessions | Hash in the route and do one `updateOne({ $set: { password, mustChangePassword }, $inc: { tokenVersion: 1 } })`. Code-only. |
| D7 ✅ done | Medium | Concurrent status updates are last-write-wins, with no record of which warden changed what | Add `statusHistory: [{ status, by, at }]` (defaults to `[]`, so old docs stay valid) and `optimisticConcurrency: true` on Complaint (version conflict → 409). Additive; no backfill needed. |
| D8 | Low | Duplicate-complaint check can race; deep pages use `skip`; `/mine` silently caps at 100; `name`/`reg` copied into complaints go stale if a profile ever changes; no account-deletion or retention policy; email format only checked in routes | Address when needed. A deletion feature must decide what happens to complaints (anonymise rather than cascade-delete). |

**Migration and data-loss rules:**
- Back up (D2) before any index or schema change.
- Only additive changes: new optional fields with defaults, new indexes.
- Never run `syncIndexes`, `dropDatabase` or `deleteMany` against production.
- A new unique index fails if duplicates exist, so check first with a read-only aggregate.
- When swapping the database user (D1), run old and new side by side and remove the old one only after the new one is verified.

## Roadmap

- **Phase 1 (done):** student/warden auth, complaints, Vercel deploy, hardening.
- **Phase 2:** cleaning staff role and cleaning requests, admin dashboard and stats, email alerts (urgent complaint → wardens, status change → student). The old prototype for these lives outside the repo in `../vit-hostel-backend/vit-hostel-backend/` (routes `cleaning.js`, `admin.js`, `utils/email.js`). Port them through the same patterns as above rather than copying them verbatim, because they have the old bugs (double hashing, leaked error messages, HTML injection in email bodies).
