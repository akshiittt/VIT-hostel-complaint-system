# Senior Review Checklist

This checklist comes from a senior-engineer review of `backend/` and `vit-hostel/` (branch `vercel-backend`, 2026-10-13).

- **Verdict:** ready to merge **with fixes**. Nothing is critical. Do the 🔴 items before real students use it.
- **Baseline:** backend `npm test` passes 14/14, frontend `npm run build` succeeds.
- **Status (2026-10-13):** items 1–21 fixed and verified.
  - Backend `npm test`: **32/32**. Frontend `npm test`: **20/20** (Vitest). `npm run build` passes on Vite 6.4.4.
  - Manual click-through passed on an in-memory DB: sign-up, multi-line complaint, warden completes it, Retry screen when the API is down, labels linked.
  - Item 2 was done in code (a Mongo-backed limiter), so no Vercel dashboard rule is needed.

Tick each box only when it's fixed **and** verified: a test for backend changes, a click-through for UI changes.

---

## 🔴 Before first production deploy

- [x] **1. Fail clearly when config is missing.**
  - `app.js` never checks `JWT_SECRET`/`MONGO_URI`; only `server.js` does, and Vercel never runs it.
  - Without the secret, register saves the user, then `jwt.sign` throws a 500. Retrying gives 409 and every login gives 500, leaving orphaned accounts.
  - Fix: check both in the `/api` middleware and return a clear 500 "Server misconfigured". Make `/api/health` report missing config.
  - Test: unset `JWT_SECRET` → register returns 500 and **no user is saved**.
  - Files: `backend/app.js`, `backend/routes/auth.js:35-37`
- [x] **2. Rate-limit the auth routes.**
  - Nothing stops password guessing on the warden account or scripted mass sign-ups.
  - An in-memory limiter doesn't work on Vercel, because each instance has its own memory.
  - Fix: a Vercel Firewall rate-limit rule on `/api/auth/*` (dashboard, no code), or a Mongo-backed limiter keyed on IP + email with `app.set('trust proxy', 1)`.
  - Files: `backend/routes/auth.js:13,40`
- [x] **3. Seed must not fall back to the published password.**
  - Without `SEED_WARDEN_PASSWORD`, the seed creates `warden@vithostel.com` / `warden1234`, and both values are public on GitHub.
  - `deleteOne` also silently deletes a *student* who uses that email.
  - Fix: refuse to run without `SEED_WARDEN_PASSWORD` (≥ 8 chars) unless `MONGO_URI` points to localhost, and refuse if the existing account with that email is not a warden.
  - Files: `backend/seed.js:10-28`
- [x] **4. Tie form labels to their inputs.**
  - Labels are siblings with no `htmlFor`/`id`, so screen readers announce unnamed fields and clicking a label doesn't focus the field (fails WCAG 1.3.1 / 4.1.2).
  - Fix: `id` + `htmlFor` on every field, `<fieldset><legend>` for the complaint-type radios, `role="alert"` on `.error-msg` and `role="status"` on `.success-msg`.
  - Files: `LoginPage.jsx`, `ComplaintForm.jsx`, `ComplaintList.jsx:19-20`

## 🟠 Backend hardening (small, each with a test)

- [x] **5. Duplicate-email race → 409, not 500.** Check-then-create isn't atomic: parallel register requests returned `[201, 500, 500]`. Map Mongo error `11000` to 409 in the error handler. (`routes/auth.js:29-35`, `app.js`)
- [x] **6. Honour `err.status` in the error handler.** A body over 100 kB returns 500 instead of 413. Use `err.status` when `err.expose` is true. (`app.js:38-44`)
- [x] **7. Add length limits to string fields.** A 90 kB name was accepted and gets copied into every complaint. Add `maxlength` and route checks: name 100, regNumber 20, room 20, email 254. (`models/User.js`, `models/Complaint.js:27`)
- [x] **8. `resolvedAt` should only change on a real transition.** Marking an already-completed complaint "Completed" again overwrites the original resolution date. (`routes/complaints.js:64`)
- [x] **9. Add indexes matching the sorts:** `{ studentId: 1, createdAt: -1 }` for `/mine` and `{ urgent: -1, createdAt: -1 }` for the warden list. (`models/Complaint.js`)
- [x] **10. Pin the Node major version:** `"engines": { "node": "22.x" }` so Vercel doesn't move to a new major on its own. (`backend/package.json:8`)

## 🟠 Frontend behaviour

- [x] **11. Only log out on 401 during session restore.** `.catch(() => clearToken())` also logs the user out on network errors and Atlas cold-start timeouts. Clear the token only on `status === 401`, otherwise show a retry option. (`App.jsx:20`)
- [x] **12. Handle 401 on complaint submit.** An expired token shows "Not authorized, token failed" in the form instead of logging out. (`App.jsx:56-59`)
- [x] **13. Ignore stale responses after logout/login.** If a warden logs out and a student logs in before an in-flight `loadComplaints` finishes, the old list can overwrite the new one. Use an AbortController or a request id. (`App.jsx:31-48`)
- [x] **14. Refresh button for students.** Students can't see status changes without reloading the page. Pass `onRefresh` to `ComplaintList`, like the warden panel. (`StudentDashboard.jsx`, `ComplaintList.jsx`)
- [x] **15. Keep description formatting.** Add `white-space: pre-wrap; overflow-wrap: anywhere;` so newlines are kept and long strings don't overflow on phones. (`App.css` `.card-desc`)
- [x] **16. Make keyboard focus visible.** Remove `outline: none` and add `:focus-visible` outlines. (`App.css:86`, `App.css:370`)
- [x] **17. One source for the filter options.** `ComplaintList.jsx:21-26` hard-codes the complaint types; map over `COMPLAINT_TYPES` instead.

## 🟡 Deploy and tooling

- [x] **18. Document that CORS blocks Vercel preview URLs.** `ALLOWED_ORIGINS` is an exact list. Note it in `DEPLOY.md` step 5, or allow the project's preview domain pattern.
- [x] **19. Upgrade Vite 4, which is end-of-life,** to Vite 6+ with `@vitejs/plugin-react` ≥ 4.3, then rebuild and click through. (`vit-hostel/package.json`)

## 🟡 Tests

- [x] **20. Backend tests for:** missing `JWT_SECRET`, duplicate-email race, payload too large (413), CORS allow/deny, "In Progress" status, field length limits. (Most come with items 1, 5, 6 and 7.)
- [x] **21. Frontend tests:** add Vitest + React Testing Library covering login/register validation, the complaint form (block resets on hostel change, errors shown), and the warden status buttons.

---

## Follow-ups found during the fixes

- [x] **22. Status-update failures use a blocking `alert()` popup.** Show an on-page `role="alert"` message in the warden panel instead. (`vit-hostel/src/App.jsx` `updateComplaintStatus`)
- [x] **23. The frontend doesn't enforce the backend `LIMITS`.** Add `maxLength` (name 100, regNumber 20, room 20, password 72) to the register and complaint inputs, so users see the limit before the server rejects them. (Mirror `LIMITS` in `vit-hostel/src/constants.js`.)
- [ ] **24. Advisories in dev-only test tooling.** `npm audit` reports 3 (tinypool, @vitest/mocker). They're not in the production bundle. Fixing them needs Vitest 4+/Vite 7+, so revisit with the next Vite upgrade.
- [x] WardenPanel load error was missing `role="alert"`. Fixed.

## Security check + bug hunt (2026-10-13, second pass)

- **Security review** of `backend/` and `vit-hostel/src`: **no exploitable vulnerabilities** found.
  - Checked: NoSQL operator injection, mass assignment and role escalation, access to other students' complaints, JWT handling, data leaks, XSS, secrets.
- **Bug hunt:** 6 findings, all fixed. Backend 37/37, frontend 20/20.
  - [x] Per-IP rate limits would have blocked a whole hostel behind one shared WiFi IP. Raised to 300 logins per 15 min and 100 sign-ups per hour per IP; the per-account limit (10 per 15 min) still stops password guessing.
  - [x] An `ALLOWED_ORIGINS` value with a trailing `/` or capital letters silently broke CORS. It's now normalised (`lib/config.js` → `parseAllowedOrigins`).
  - [x] Sign-up rejected emails with surrounding spaces, such as a trailing space from autocomplete. The email is now trimmed first.
  - [x] The root `node_modules` (549 files) was committed to git. Untracked it and added a root `.gitignore`.
  - [x] Token signing and checking now both use HS256 explicitly.
  - [x] Seed no longer checks the password twice.

## Production-readiness pass (2026-10-13, third pass)

From the full-repo architecture review. Backend tests 66/66, frontend 35/35. Clicked through on an in-memory DB.

- [x] **Identity:** optional `ALLOWED_EMAIL_DOMAINS`, and registration numbers are unique among students (index + 409).
- [x] **Account recovery:** students and wardens can change their own password, and wardens can reset a student's password to a one-time temporary password. The server blocks complaint routes until the student changes it.
- [x] **Session revocation:** `tokenVersion` is stored in the JWT, so a password change or reset logs the account out everywhere.
- [x] **CI:** `.github/workflows/ci.yml` runs both test suites and the frontend build.
- [x] **Health check** pings the DB (503 when it's unreachable).
- [x] **Warden list:** server-side paging and status filter, with counts calculated on the server.
- [x] "In Progress" button and badge; on-page errors instead of `alert()` (#22); `maxLength` on inputs (#23).
- [x] `vercel.json` pins `"framework": null`, so Vercel always runs `api/index.js`.
- [x] README rewritten. The unused duplicate image and the unused `user` prop on WardenPanel are removed. A test keeps frontend and backend constants in sync.

**Still needs you:**
- Atlas cluster, Vercel projects and seeding the warden (DEPLOY.md).
- Email verification and email alerts (need an email-sending service, e.g. Resend or SendGrid).
- Monitoring (e.g. Vercel log drains or Sentry).
- Merging into `main`.

**Open:**
- [ ] #24: advisories in the dev-only test tools.
- [ ] Wardens see every hostel. Scope wardens to hostels/blocks if that's how VIT assigns them.

## Backend audit (2026-10-13, fourth pass)

Backend tests 84/84, frontend 51/51. The audit probe was re-run against the fixed code.

- [x] **H1** Complaint spam: 10 per hour per student, 3 urgent per day, duplicates within 10 minutes → 409. In the probe, 60 identical urgent complaints now produce 1 created.
- [x] **H2** Login brute force: added a per-account limit (30/hour across IPs). `trust proxy` is only on for Vercel; a rotating X-Forwarded-For is now blocked 30/30 elsewhere. The warden seed password needs 12+ characters.
- [x] **M1** Warden resets record `passwordResetAt` and `passwordResetBy`, emit an audit log line, and show the student when it happened. *A warden can still take over a student account. That's inherent to resetting without email; the trail makes it visible.*
- [x] **M2** Registration numbers must match the VIT format (`23BCE1234`), on both client and server.
- [x] **M3** Database outage → 503 + `Retry-After` in about 5 s, instead of a 500 after 10 s.
- [x] **M4** Passwords need 8+ characters, and common passwords are rejected.
- [x] **M5** Structured JSON request and audit logs, with no bodies, tokens or passwords.
- [x] **L1–L7, L9, L10**:
  - `__v` hidden.
  - `Cache-Control: no-store` on auth responses.
  - `X-Powered-By` removed and `nosniff` added.
  - Unknown `/api` paths → 404.
  - Schema enforces hostel and block.
  - `/mine` capped at 100.
  - Reset limited to 20 per hour.
  - Atomic `tokenVersion`.
  - Status codes documented in DEPLOY.md.
- [ ] **L8** (kept on purpose): `/api/health` lists missing env var *names*. This is a debugging aid; no values are ever shown.

## Defensive security audit (2026-10-13, fifth pass)

Backend tests 90/90, frontend 53/53. `npm audit` (all dependencies, including dev): **0 vulnerabilities** in both projects. CSP checked by serving the build with the production headers: 0 violations across login, the warden list, a status change and logout.

**Verified clean:**
- No secrets in git history (any branch) or in the live bundle; source maps return 403.
- NoSQL injection blocked; XSS and CSRF don't apply; access to other students' data blocked.
- CORS, error messages and rate limits all checked live.

**Fixed in code:**
- [x] **M2** Frontend security headers: CSP (incl. `frame-ancestors 'none'`), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
- [x] **M3** Tokens expire after 1 day instead of 7. `POST /api/auth/logout` ends the session on the server, and the Logout buttons call it.
- [x] **L4** bcrypt cost 12, with existing hashes upgraded at the next login.
- [x] **L1** Dev-dependency vulnerabilities: nodemon → `node --watch` (removes `braces`); Vitest 3 → 5 (removes `tinypool`/`@vitest/mocker`).

**Owner actions (not code):**
- [ ] **V1** Confirm the production `JWT_SECRET` is the long random value (replace it if unsure; everyone is logged out once).
- [ ] **H1** Change the Atlas password for user `akshit` (update Vercel + `backend/.env`), and delete `../vit-hostel-backend/vit-hostel-backend/.env`.
- [ ] **H2** Change or revoke the Gmail credential that was in that old `.env`.
- [ ] **M1** Limit the Atlas user to `readWrite` on the `vithostel` database.
- [ ] **M4** Delete `SEED_WARDEN_PASSWORD` from `backend/.env`.
- [ ] **L2** Drop any leftover `test` database in Atlas.
- [ ] **L3** Turn off GitHub Pages / delete the `gh-pages` branch.

## Database audit (2026-10-13, sixth pass)

Backend tests 99/99 (3 consecutive runs), frontend 54/54. Production was inspected read-only (counts and index names only): all indexes exist, there are no duplicates, no orphaned complaints, and no leftover `test` database.

- [x] **D3** Connection pool capped (`maxPoolSize` 10, idle connections closed after 60 s).
- [x] **D4** `{ status, urgent, createdAt }` index: the stat counts and filtered lists no longer scan the whole collection.
- [x] **D5** Index-build failures are logged (`index_error`); `npm run db:indexes` creates missing indexes without dropping anything.
- [x] **D6** Password change and reset are single atomic writes (hash + `tokenVersion` together).
- [x] **D7** `statusHistory` (who/when) and optimistic concurrency (a conflicting update → 409; the UI shows it and reloads).
- [ ] **D1** (owner) Replace the `atlasAdmin` app user with `readWrite@vithostel`.
- [ ] **D2** (owner) Backups: `mongodump` schedule and a test restore.
- [ ] **D8** (low) Duplicate-check race, deep-page `skip`, `/mine` cap indicator, retention/deletion policy.

## Accepted decisions (not fixing now)

- **JWT in localStorage, 7-day expiry, no server-side revocation.** Acceptable because there are no XSS sinks (React escaping, no `dangerouslySetInnerHTML`). httpOnly cookies would need SameSite/CSRF handling across two Vercel domains. Revisit if an admin role is added in phase 2.
- **Login timing reveals which emails exist.** An unknown email skips bcrypt and responds faster. Low impact, since register's 409 already reveals whether an email exists.
- **No pagination** on complaint lists. Fine at hostel scale; revisit if the warden list grows past a few hundred.

## Out of scope for phase 1 (from the review's "declined" list)

- Cleaning staff, admin dashboard, email alerts: phase 2.
- Email verification / restricting sign-up to `@vitstudent.ac.in`: worth considering with item 2 to cut spam accounts.
- Warden "In Progress" button, editing or deleting complaints, password reset: not in the spec.
