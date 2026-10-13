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
- `lib/rateLimit.js` + `models/RateLimit.js`: a fixed-window limiter whose counts live in MongoDB (with a TTL index), because Vercel instances don't share memory. It's applied to login (per IP+email and per IP) and register (per IP). `app.set('trust proxy', 1)` makes `req.ip` the client IP. Never replace it with an in-memory limiter, and never add a flag to disable it in tests (the tests drop the DB between cases instead).
- Auth: JWT (HS256) signed with `JWT_SECRET`, payload `{ id, v }`, 7-day expiry. Sent as `Authorization: Bearer <token>`. Always create tokens with `lib/token.js` → `generateToken(user)`.
  - `v` is `user.tokenVersion`. `protect` returns 401 "Session expired" when they differ. Changing or resetting a password bumps it, which ends all existing sessions.
  - `user.mustChangePassword` is set by a warden reset. `requirePasswordChanged` (used on every complaint route) returns 403 until the user changes their password. `/me` and change-password stay open.
  - Temporary passwords come from `lib/tempPassword.js` (crypto, unambiguous alphabet). Never log them.
- Sign-up identity: `ALLOWED_EMAIL_DOMAINS` (optional, comma-separated) restricts email domains. `regNumber` is unique among students (a partial unique index plus a route check), and the error handler maps 11000 on regNumber to a 409 with its own message.
  - `protect` loads the user and returns 401 if the token is invalid or the user is gone.
  - `allowRoles(...)` returns 403.
- Roles: `student` (self-register via `/api/auth/register`, which always forces role `student`) and `warden` (created only by `seed.js`).
- Passwords are hashed **only** in the `User` pre-save hook. Always pass plain passwords to `User.create`/`save`. Hashing beforehand double-hashes and breaks login (this was the bug in the old backend). `password` has `select: false`, so use `.select('+password')` when you need it.
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

## Roadmap

- **Phase 1 (current):** student/warden auth, complaints, Vercel deploy.
- **Phase 2:** cleaning staff role and cleaning requests, admin dashboard and stats, email alerts (urgent complaint → wardens, status change → student). The old prototype for these lives outside the repo in `../vit-hostel-backend/vit-hostel-backend/` (routes `cleaning.js`, `admin.js`, `utils/email.js`). Port them through the same patterns as above rather than copying them verbatim, because they have the old bugs (double hashing, leaked error messages, HTML injection in email bodies).
