# Project review: VIT Hostel Complaint System

Senior-engineer and technical-interviewer review, 2026-10-14. Scores are for the project **as it is**, judged as a production web app, not graded on a curve for a student project.

## Evidence used

| Evidence | Result |
|---|---|
| Backend tests | 121/121 pass (stable across repeated runs); coverage 98.85% lines, 95.32% branches |
| Frontend tests | 97/97 pass; coverage 96.06% lines, 90.26% branches |
| Full-stack journeys | 25/25 pass: real React UI (jsdom) + real API + in-memory MongoDB |
| Build / audit | Production build OK (52.9 KB gzipped JS); `npm audit` 0 vulnerabilities in both projects |
| CI | GitHub Actions green on every push so far; the new `journeys` job hasn't run on GitHub yet |
| Production | `/api/health` ok; CORS, validation and the security headers checked live; read-only DB check: indexes present, no duplicates or orphans; the owner ran the student → warden → Completed flow on the live site |
| Measured performance | API in Vercel `iad1` (US) while Atlas is in Mumbai: unknown-user login about 1.1 s, health 0.5–0.9 s warm. Fix (`bom1`) written but **not deployed yet**. |

## Implemented vs tested vs verified in production

| Feature | Implemented | Automated tests | Verified in production |
|---|---|---|---|
| Student sign-up (domain, reg format, password policy) | ✅ | ✅ unit + API + journey | ✅ domain rule (live 400); sign-up done by the owner |
| Login / session restore / expired-session notice | ✅ | ✅ | ✅ login (owner); 401 paths via curl |
| Submit complaint, My Complaints | ✅ | ✅ | ✅ (owner) |
| Warden list, paging, filter, status change | ✅ | ✅ | ✅ status change (owner: 1 complaint Completed). Paging not exercised (1 complaint). |
| Complaint rate limits / duplicate 409 | ✅ | ✅ | ❌ not exercised live |
| Change password / warden reset / forced change | ✅ | ✅ incl. journeys | ❌ not exercised live |
| Server-side logout (tokenVersion) | ✅ | ✅ | ⚠️ endpoint live (401 without token); real session not tested live |
| Concurrent status 409 + statusHistory | ✅ | ✅ | ❌ |
| Security headers / CSP | ✅ | ⚠️ checked by serving the build, no automated test | ✅ live headers, 0 CSP violations |
| Region `bom1`, asset caching, smaller images | ✅ (local) | n/a | ❌ **not deployed** |
| Email alerts, email verification, cleaning staff, admin | ❌ not built | — | — |

## Scores

| Category | Score | Evidence |
|---|---|---|
| Code quality & maintainability | **7.5/10** | Consistent conventions, small backend modules (`lib/*`), comments explain *why*, nothing dead (searched). Against: `App.jsx` holds all state, data loading and session logic (~260 lines) and is the riskiest file (both recent race bugs were there); a single ~800-line `App.css`; constants duplicated between front and back (kept in sync by a test). |
| Architecture & separation of concerns | **7.5/10** | Clean `app.js`/`server.js`/`api/index.js` split; middleware mounted per router; lazy cached DB connection; routes → models → lib. Against: no service layer (routes talk to Mongoose directly); rate limiting costs extra DB writes per request; no router or state hook on the frontend (fine at this size, but it's why `App.jsx` grew). |
| Correctness & reliability | **7.5/10** | Broad tests plus regression guards for 18 fixed bugs; atomic writes; optimistic concurrency. Against: concurrency bugs kept turning up late (stale list after login, a just-submitted complaint overwritten, found only in this pass); cold starts of 1.5–3 s; **no backups** (accepted risk). |
| Security & validation | **8/10** | Server-side authorization on every route, type-checked input (NoSQL injection blocked), rate limits shared across instances, bcrypt 12, revocable 1-day JWTs, CSP and frame protection, least-privilege DB user, no secrets in git or the bundle. Against: token in `localStorage` (CSP limits but doesn't remove the XSS-theft risk); logout ends **all** devices; no email verification; a warden can take over a student account via reset (audited, not prevented); credentials sat in Dropbox `.env` files until recently. |
| Database design | **7/10** | Schemas match the domain, enums, partial unique index, indexes confirmed by query plans, TTL for rate limits, `statusHistory`. Against: no backups; `name`/`reg` copied into complaints (fine now, wrong if profiles become editable); automatic index builds don't finish on Vercel (needs the manual `db:indexes` step); no retention or deletion policy for personal data. |
| Testing quality | **8.5/10** | Layered tests (unit, API, DB, auth, component, full-stack journeys), positive and negative cases, real MongoDB instead of mocks, a regression map in `docs/TESTING.md`, coverage measured. Against: **no real-browser E2E** (CSS, layout and real CORS unverified automatically), no automated accessibility audit, no load test, CSP/Vercel config untested, the journeys CI job hasn't run on GitHub. |
| Performance | **6/10** (current production) | Small bundle and indexed queries. Against (measured): a cross-continent DB round trip on every query (about 1.1 s login, 0.5–0.9 s health); hashed assets not cached; 87 KB images; cold starts. The fixes for the first three are written but not deployed. **Expected 8/10 once deployed and verified.** |
| Deployment reliability | **7/10** | Two Vercel projects, CI, health check, release checklist, rollback notes (incl. the env-var snapshot caveat), env-var reference. Against: real incidents during setup (`MANGO_URI` typo, stale `ALLOWED_ORIGINS`, a removed `JWT_SECRET`) show the config is fragile and manual; no staging environment (previews share the prod API and DB); Hobby rollback only goes back one deployment; no uptime monitoring or alerting. |
| Documentation & setup | **8.5/10** | `README`, `DEPLOY.md` (step-by-step, troubleshooting, env table, rollback), `CLAUDE.md` (architecture + conventions + status), `docs/TESTING.md`, `check.md`. Against: a lot to read and some overlap; no architecture diagram; no API schema (OpenAPI); decisions are scattered instead of in short ADRs. |
| End-to-end evidence | **7/10** | Production health, CORS, validation and headers checked; the owner's live flow left a Completed complaint in the DB; journeys cover the full flows locally. Against: password reset, forced change, logout revocation, rate limits and concurrency are verified only in tests, not on production; the performance fixes aren't live. |

**Overall: about 7.5/10.** It's a solid, well-tested personal project with production-grade security basics. The remaining gaps are operational: backups, monitoring, staging, a real-browser smoke test, and the performance fixes still to deploy.

## 1. Remaining release blockers

No **code** blockers: all suites pass and nothing in the code would stop a release. Before inviting real students:

1. **Deploy and verify the performance changes** (region `bom1`, asset caching, images). Use the "Verify after a deploy" commands in DEPLOY.md.
2. **Confirm the new `JWT_SECRET` is live** (log in on the site; or check that `npx vercel env ls production` shows it and the newest deployment is after it).
3. **Owner security actions:** confirm the old `akshit` DB user is deleted; change/revoke the Gmail credential that was in the deleted prototype `.env`; set `SEED_WARDEN_PASSWORD=` to empty.
4. **Accepted risk, not a blocker by your decision:** no backups.

## 2. Top five improvements by impact

1. **Email verification + email-based password reset** (a free tier such as Resend). Proves sign-ups really belong to the university, and removes the warden-takeover path.
2. **Free backups:** an `npm run db:backup` JSON export plus a restore into a scratch DB. Cheap insurance; currently a deleted collection is unrecoverable.
3. **Real-browser smoke test** (Playwright, one dev dependency) against a Vercel preview in CI: catches CSS, CSP, CORS and routing issues jsdom can't.
4. **Split `App.jsx`** into a `useSession` and a `useComplaints` hook. That's where the race bugs lived; smaller units are easier to test and reason about.
5. **Staging + monitoring:** a separate Atlas database for previews (so previews never touch prod data) and a free uptime check on `/api/health` with alerts.

## 3. Missing tests or documentation

- Real-browser E2E; automated accessibility checks (axe) and contrast regression; load and latency tests; a test that parses the `vercel.json` headers and rewrites (CSP regressions); a production smoke script that doesn't write data.
- Docs: an architecture diagram (browser → Vercel edge → function in bom1 → Atlas Mumbai), an API schema (OpenAPI) generated from the routes, short ADRs for the key decisions below, and a data-retention note.

## 4. Questions an interviewer could ask

1. Walk me through what happens, end to end, when a student submits a complaint.
2. Why JWTs instead of server sessions? How do you revoke a JWT before it expires?
3. Why does logout log a user out on every device, and how would you make it per-device?
4. Your rate limiter stores counts in MongoDB. Why not in memory? What does it cost per request?
5. Why is `trust proxy` only enabled on Vercel? What attack does that prevent?
6. How do you prevent a student from reading another student's complaints? Show me the code.
7. What's NoSQL injection, and how does your validation stop `{ "$ne": null }`?
8. Two wardens update the same complaint at once. What happens and why?
9. Why bcrypt cost 12? Why the 72-byte limit? How do existing cost-10 hashes get upgraded?
10. Your API was in the US and the DB in Mumbai. How did you find that, and what did it cost?
11. What does your CSP allow and block? What breaks if the API URL changes?
12. Why copy `name` and `reg` into complaints? When would that be wrong?
13. How do you deploy safely and roll back? What's special about rolling back env vars on Vercel?
14. What isn't tested, and why are you still confident shipping it?
15. You chose no backups. What's your recovery plan if a collection is deleted?

## 5. What you should be able to explain

- **Stack choice:** React + Vite (static SPA on Vercel's CDN), Express on Vercel serverless (free, no server to manage), MongoDB Atlas M0 (free; documents fit complaints). Trade-off: cold starts and per-instance connection pools, which is why the DB connection is cached on `global` and capped at `maxPoolSize: 10`.
- **Auth:** bcrypt hashing in one place (`hashPassword`), JWT `{ id, v }` signed with HS256, `tokenVersion` revocation (password change, reset, logout), 1-day expiry, `mustChangePassword` enforced on the server, not only the UI.
- **Authorization:** `protect` re-reads the user (role from the DB, not the token), `allowRoles`, and student queries always filtered by `req.user._id`.
- **Validation:** strings only (blocks operator injection), allow-lists for enums, length limits mirrored on the client, the `REG_NUMBER_PATTERN` / password policy, and a constants-sync test.
- **Abuse protection:** Mongo-backed fixed-window limiter (shared across serverless instances); per-account vs per-IP limits and why per-IP limits are generous (hostel NAT); the duplicate-complaint window.
- **Data integrity:** unique and partial indexes plus 11000 → 409; atomic `$inc`/`$set` writes; optimistic concurrency (`VersionError` → 409) and `statusHistory`; additive-only migrations; why `syncIndexes` must never run on prod.
- **Frontend state:** request-id guard against stale responses, 401 → `expireSession`, session restore that only logs out on 401, the double-submit guard, the 15 s fetch timeout.
- **Security headers:** CSP directives and why `connect-src` names the API, `frame-ancestors 'none'` (clickjacking), why `/assets/*` can be immutable but `index.html` can't.
- **Operations:** the env-var lessons (typo, stale origins, missing secret), `/api/health` as the first check, the region choice, the release and rollback procedure, logs without personal data.
- **Testing strategy:** why a real in-memory MongoDB beats mocks here, what the journeys do and don't prove (no real browser), and the regression map.
