---
name: vit-hostel-deployment
description: "Where the VIT hostel app is deployed (Vercel URLs, Atlas cluster, branches) as of 2026-10-13"
---

VIT hostel complaint system went live on 2026-10-13.

- Frontend (Vercel project, root `vit-hostel`): public URL **https://vithostelc.vercel.app** (since 2026-10-14; old `vit-hostel-complaint-system-bqsl.vercel.app` still works). Every site origin must be in the API's `ALLOWED_ORIGINS`; deployment URLs like `…-akshit15.vercel.app` are rejected by CORS on purpose ("Cannot reach the server").
- Backend API (Vercel project `akshit15/vit-hostel-complaint-system`, root `backend`): https://vit-hostel-complaint-system.vercel.app — check `/api/health` first when debugging.
- DB: MongoDB Atlas cluster host `<atlas-cluster-host>`, database `vithostel`.
- Repo `akshiittt/VIT-hostel-complaint-system`: `main` was fast-forwarded to `vercel-backend`; Vercel deploys `main`.
- API functions pinned to `bom1` (2026-10-14) because Atlas is in Mumbai; app DB user is `vithostel-app` (readWrite@vithostel only). New indexes don't auto-build on Vercel — run `npm run db:indexes` (needs DNS_SERVERS on the laptop).
- CD: `.github/workflows/post-deploy.yml` smoke-checks production deploys (Vercel env names look like "Production – <project>"). Branch protection on `main` (2026-10-14) requires PR checks backend/frontend/journeys, 0 approvals, but the owner chose to keep admin bypass (solo project) — direct pushes to main still go through with a "Bypassed rule violations" notice. Prefer branch + PR for real changes; direct pushes only when the user asks.

**Why:** deployment took several rounds of debugging; a misspelled env var (`MANGO_URI`) and a never-updated `ALLOWED_ORIGINS` were the causes — `npx vercel env ls production` (names only) found it.
**How to apply:** when the live app misbehaves, compare `/api/health` and CORS against this setup before changing code. Run Vercel CLI from the repo root (running it inside `backend/` fails with "Root Directory backend does not exist"). See also [[user-laptop-dns-srv]].
