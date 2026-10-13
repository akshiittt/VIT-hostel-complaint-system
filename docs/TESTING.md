# Testing

How this project is tested, how to run each layer, and which test guards each bug that was fixed before. Every suite runs locally and in CI against an **in-memory MongoDB** and never touches Atlas or any real database.

## Commands

| What | Where | Command | Needs |
|---|---|---|---|
| Backend: unit + API + DB integration + scripts | `backend/` | `npm test` | `npm ci` in `backend/` |
| Backend coverage (Node's built-in, no extra deps) | `backend/` | `npm run test:coverage` | Node 22.5+ |
| Frontend: unit + component (fetch stubbed) | `vit-hostel/` | `npm test` | `npm ci` in `vit-hostel/` |
| Frontend coverage (`@vitest/coverage-v8`) | `vit-hostel/` | `npm run test:coverage` (HTML report in `vit-hostel/coverage/`) | as above |
| Full-stack journeys | `vit-hostel/` | `npm run test:journeys` | `npm ci` in **both** `backend/` and `vit-hostel/` |
| Production build | `vit-hostel/` | `npm run build` | |

Run one backend file with `node --test test/scripts.test.js`, and one frontend file with `npx vitest run src/components/WardenPanel.test.jsx`.

CI (`.github/workflows/ci.yml`) runs three jobs on every push and PR:

- `backend`: `npm test`.
- `frontend`: `npm test` and `npm run build`.
- `journeys`: `npm ci` in both packages, then `npm run test:journeys`.

The `backend` and `journeys` jobs cache the MongoDB binary.

## Layers

| Layer | Tools | Files | What it proves |
|---|---|---|---|
| Unit (pure logic) | `node:test` | `backend/test/seed.test.js`, `config.test.js`, `tempPassword.test.js`, `constantsSync.test.js` | Seed decisions, origin and domain parsing, temp-password alphabet, and that the frontend constants match the backend ones. No database. |
| API | `node:test` + `supertest` against `app.js` (no port) | `backend/test/api.test.js`, `audit.test.js`, `errorPaths.test.js` | Status codes, messages, auth, roles, validation, rate limits, CORS headers and error mapping (409/413/503/500). |
| DB integration | the same files with `mongodb-memory-server` | as above | Unique and partial indexes, atomic `$inc`/`$set` writes, optimistic concurrency (`VersionError` → 409), the TTL index and `ensureIndexes()`. Index use is checked with `explain`. |
| Auth / sessions | as above | `api.test.js`, `audit.test.js` | HS256 pinning, `tokenVersion` revocation (logout, password change, reset), forced change after a reset, 1-day expiry, bcrypt cost and rehash on login. |
| Ops scripts | `node:test` + `child_process` | `backend/test/scripts.test.js` | `seed.js`, `scripts/db-indexes.js` and `server.js` run as real processes: their output and exit codes. |
| DB down | `node:test` | `backend/test/dbDown.test.js`, `errorPaths.test.js` | An unreachable DB at startup gives 503 + `Retry-After`. Mongo errors in the middle of a request give 503. A hung ping times out the health check after 5 s. |
| Frontend component | Vitest + React Testing Library, `fetch` stubbed | `vit-hostel/src/**/*.test.jsx`, `src/api.test.js` | Rendering, labels and roles, form validation, callbacks, timers (notices that auto-hide), and `App` session logic with canned responses. |
| **Full-stack journeys** | Vitest + RTL + the real backend + `mongodb-memory-server` | `vit-hostel/src/journeys/*.journey.test.jsx` | The real `<App />` in jsdom talks over HTTP to the real Express app on a random local port, backed by a real (in-memory) MongoDB. Nothing is stubbed. |

### Full-stack journeys: what they are and aren't

They are **full-stack journey tests: React in jsdom, a real API and a real MongoDB**. They are **not browser E2E**: there's no real browser engine, CSS, layout or focus behaviour. Node's `fetch` stands in for the browser's, so **CORS is not enforced** here (CORS headers are checked in `api.test.js` instead).

How they work (`src/journeys/harness.js`, `vitest.journeys.config.js`):

1. `vitest.journeys.config.js` resolves `backend/` and passes it in as `JOURNEY_BACKEND_DIR`, because inside jsdom `import.meta.url` is an `http://` URL.
2. The harness loads the CommonJS backend with `createRequire(backend/package.json)`. That way `mongoose`, `mongodb-memory-server` and `./app` resolve from `backend/node_modules`, and the app and the test helpers share one mongoose instance.
3. It starts a `MongoMemoryServer`. It points `MONGOMS_DOWNLOAD_DIR` at `backend/node_modules/.cache/mongodb-memory-server`, so the cached binary is reused and nothing is downloaded into `vit-hostel/`.
4. **Before** requiring `app.js` it sets `MONGO_URI` (memory server), `JWT_SECRET`, `LOG_LEVEL=silent`, `BCRYPT_ROUNDS=4` and `ALLOWED_ORIGINS` (jsdom's origin, `window.location.origin`). It then calls `app.listen(0, '127.0.0.1')`.
5. `src/api.js` reads `import.meta.env.VITE_API_URL` once, at module load. So `loadApp(url)` calls `vi.stubEnv('VITE_API_URL', url)`, then `vi.resetModules()`, then a dynamic `import('../App.jsx')`. A static `define` can't work because the port is random.
6. Each journey file gets its own Vitest worker process, memory server and API server (`fileParallelism: false`, so they run one at a time). `beforeEach` drops the database, which also resets rate-limit counters, and rebuilds the unique indexes.
7. The default `npm test` excludes `src/journeys/**`, so it stays fast and doesn't need the backend installed.

| Journey | File | Positive | Negative |
|---|---|---|---|
| 1 Sign up → complaint → My Complaints | `student.journey.test.jsx` | Complaint is stored with the server-side identity, listed, and still there after a reload | An empty form makes no request |
| 2 Warden filters Open → Completed → student sees it | `warden.journey.test.jsx` | Stat boxes, filter, status saved with `resolvedAt` and history; the student's reload shows Completed | Wrong warden password; a student token gets 403 on the warden list |
| 3 Warden reset → temp login → forced change | `warden.journey.test.jsx` | Old password refused; temp password opens only the forced screen (the server also returns 403); new password works; the token from before the reset gets 401 and its device shows the expired notice | Unknown student email; reusing the temp password |
| 4 Session revoked server-side | `session.journey.test.jsx` | Logout from "another device" makes the next Refresh, submit or reload show *"Your session expired. Please log in again."*; logging in again clears it; the Logout button really revokes on the server | (the whole journey is the negative path) |
| 5 Duplicate complaint within 10 min | `student.journey.test.jsx` | A different complaint right after is accepted | Same description shows the 409 message; only one copy is stored |
| 6 Database unavailable | `dbDown.journey.test.jsx` (unreachable URI from the start), `dbOutage.journey.test.jsx` (memory server stopped mid-session) | A saved session is kept and the Retry screen is shown | Login, sign-up, Refresh and submit all show *"The service is temporarily unavailable…"*; health returns 503 |
| 7 Invalid sign-up | `signup.journey.test.jsx` | The allowed domain succeeds after the error | Bad reg number and short password (client messages); common password, non-university domain (`ALLOWED_EMAIL_DOMAINS`), duplicate email and duplicate reg number (server messages) |

## Isolation: how tests stay away from production

- **Backend:**
  - Each test file starts its own `MongoMemoryServer` and sets `process.env.MONGO_URI` to it before requiring `app.js`.
  - `node --test` runs each file in its own process (`--test-concurrency=1`).
  - Tests drop the database in `beforeEach`. Rate limits are never disabled; dropping the DB resets their counters.
- **Scripts (`scripts.test.js`):**
  - `seed.js`, `db-indexes.js` and `server.js` call `dotenv`, which reads `.env` from the current directory. The children therefore run in an **empty temp directory**.
  - **Every** app variable is passed explicitly, empty when unused. `dotenv` never overrides a variable that already exists, so `backend/.env` can't leak in.
  - The "remote URI" seed test uses `mongodb+srv://…@cluster0.example.invalid`. `.invalid` never resolves, and the seed aborts before connecting anyway.
- **Journeys:** the API only ever gets a memory-server URI, or `mongodb://127.0.0.1:1/unreachable` for the outage journey.
- `LOG_LEVEL=silent` and `BCRYPT_ROUNDS=4` are set in every backend test and journey. Production never sets either.
- No test reads or prints `backend/.env` or `.env.local`.

## Regression map

Each bug that was fixed before, and the test(s) that fail if it comes back. Backend test files are in `backend/test/`; frontend paths are under `vit-hostel/src/`.

| Fixed bug | Guarding test(s) |
|---|---|
| Seed double-hashed the warden password (login always failed) | `api.test.js` › *seeded-style warden can log in (password hashed once)*; `scripts.test.js` › *seed creates the warden with the password hashed exactly once*, *seed run again updates the existing warden instead of duplicating it*; every warden journey logs in a warden created through the model |
| Per-IP limits locked out a hostel behind one NAT IP | `api.test.js` › *per-IP limits leave room for a hostel sharing one NAT IP*, *login is rate limited per IP + email*; `audit.test.js` › *H2: one account gets at most 30 login attempts an hour, whatever the IP* |
| `ALLOWED_ORIGINS` with a trailing slash or capitals blocked the real frontend | `config.test.js` › *allowed origins tolerate trailing slashes, spaces and letter case*; `api.test.js` › *CORS allows the default dev origin and rejects others* |
| Untrimmed email on register | `api.test.js` › *register accepts an email with surrounding whitespace*; `errorPaths.test.js` › *register rejects a malformed email after trimming* |
| JWT algorithm not pinned | `api.test.js` › *tokens signed with another algorithm are rejected* |
| Stale complaint list shown after logout/login (`version-1/ai-docs/check.md` #13) | `App.regressions.test.jsx` › *#13: ignores a warden list that arrives after logout and a student login* (new; there was no test before) |
| Session restore logged out on a network/server error (#11) | `App.test.jsx` › *keeps the token and offers Retry when the server is unreachable*; `App.regressions.test.jsx` › *#11: a server error (not 401) during session restore keeps the token*; `dbDown.journey.test.jsx` › *a saved session is kept (not logged out) and the Retry screen shows the message* |
| 401 on complaint submit showed an error instead of logging out (#12) | `App.regressions.test.jsx` › *#12: a 401 when submitting a complaint logs out with the notice instead of showing it in the form* (new); `session.journey.test.jsx` › *submitting a complaint with the revoked session logs out instead of showing an error in the form* |
| Duplicate-key race returned 500 instead of 409 (#5) | `api.test.js` › *concurrent duplicate registrations return 409, not 500*, *concurrent duplicate registration numbers return 409, not 500*, *duplicate-key errors on email keep the email message*; `errorPaths.test.js` › *rate limiter: a duplicate-key race on a new window is retried and still counted* |
| Body over 100 kB returned 500 instead of 413 (#6) | `api.test.js` › *oversized JSON body returns 413* (and *malformed JSON returns 400*) |
| `resolvedAt` overwritten when re-marking Completed (#8) | `api.test.js` › *resolvedAt only changes on a real transition to or from Completed*; `warden.journey.test.jsx` › *filters Open, marks it Completed…* (checks `resolvedAt` is set) |
| `X-Forwarded-For` spoofing to dodge login limits | `api.test.js` › *without VERCEL, X-Forwarded-For is ignored so it cannot dodge the login limit* |
| Complaint spam and double submits | `audit.test.js` › *H1: a student can file at most 10 complaints an hour*, *H1: at most 3 urgent complaints a day, non-urgent still allowed*, *H1: an identical complaint within 10 minutes is rejected as a duplicate*; `student.journey.test.jsx` › *shows the API 409 message and keeps a single copy* |
| Password and `tokenVersion` written in two steps (crash in between = no revocation) | `audit.test.js` › *L9: tokenVersion is bumped atomically by password changes*, *D6: changing a password is one atomic write (no save + separate $inc)*, *D6: a warden reset is one atomic write too* |
| Concurrent status changes silently overwrote each other | `audit.test.js` › *D7: concurrent status changes never silently overwrite each other*; `App.test.jsx` › *shows the conflict message and reloads the list when another warden changed it first* |
| `mustChangePassword` enforced only in the UI | `api.test.js` › *a student with a temporary password must change it before using complaints*, *warden resets a student password and the student must change it*; `warden.journey.test.jsx` › *temporary password → forced change → dashboard works…* (direct API call gets 403) |
| Password change triggered a complaints reload (`mustChangePassword` `undefined` → `false` changed the effect deps) | `App.test.jsx` › *does not reload complaints after a normal password change*. Its `/me` user has no `mustChangePassword` field (`undefined`) and the change returns `false`. |
| A list load in flight overwrote a just-submitted complaint (found by this test pass, fixed 2026-10-14: `addComplaint` now invalidates in-flight loads) | `App.regressions.test.jsx` › *keeps a just-submitted complaint when an older list response arrives afterwards* |

## Open bugs

None known. The bug found while writing this plan (a list load in flight overwrote a just-submitted complaint) is fixed and guarded in the regression map above.

## Coverage

- **Backend:**
  - `npm run test:coverage` uses `node --experimental-test-coverage` and excludes `test/**`.
  - Child processes started by `scripts.test.js` are included.
  - `server.js` is under-reported: the boot test kills the server, so its coverage file is never written.
  - The report also lists `vit-hostel/src/constants.js`, which `constantsSync.test.js` loads.
- **Frontend:**
  - `npm run test:coverage` covers `src/**`, excluding tests, `src/test/**`, `src/journeys/**` and `src/main.jsx`.
  - Journeys aren't included in these numbers.

## Not covered / limits

- **Real browsers:**
  - No Chrome, Firefox or Safari run, so no real CSS, layout, responsive breakpoints, fonts or images.
  - No browser-enforced CORS or CSP: the journeys use Node's `fetch`, and the CSP lives in `vit-hostel/vercel.json`.
  - No real focus order or scrolling, and no click-through on a phone.
- **Accessibility:** beyond labels, roles, `aria-expanded` and the skip link, there's no automated a11y audit (axe), no colour-contrast check and no screen-reader testing.
- **Visual regressions:** no screenshot tests.
- **Vercel runtime:**
  - No test runs inside a Vercel serverless function: cold starts, the `trust proxy` + real `X-Forwarded-For` path (`VERCEL` set), the `vercel.json` rewrites and headers on the platform, region latency, or function timeouts.
  - `api.test.js` only checks the backend `vercel.json` file contents.
- **MongoDB Atlas specifics:** `mongodb+srv` DNS, TLS, Atlas user permissions (`readWrite@vithostel`), the M0 connection cap, Atlas's TTL monitor timing, and failover or elections. Tests use a single local `mongod` 7.0.
- **Production data:** no test runs against real users or complaints, older document shapes beyond the one `D7` legacy-complaint test, or the real index state. Use `npm run db:indexes` against production only as documented in `CLAUDE.md`.
- **Load and performance:** no concurrency or soak tests beyond the small parallel-request races, and no measurement of p95 latency or connection-pool exhaustion.
- **Time-based behaviour at real scale:** rate-limit windows and token expiry are checked by inspecting the stored values and the token, not by waiting out real windows.
- **Recovery after an outage:** the outage journeys check the 503 message, not that the app recovers once MongoDB comes back.
- **Not built yet, so not tested:** email alerts, cleaning staff role, admin dashboard (Phase 2), password reset by email, account deletion and retention.
- **Security testing:** the suites cover the specific fixes above. There's no fuzzing, dependency scanning in CI (`npm audit` is run by hand), or penetration test.
