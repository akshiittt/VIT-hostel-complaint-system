# VIT Hostel Complaint and Request System

**Live: https://vithostelc.vercel.app**

A web app where VIT hostel students report problems (electricity, water, WiFi, room change and more) and wardens track and resolve them.

- **Review 1:** HTML/CSS/JS prototype (the root `index.html`, `student.html`, `warden.html`, `script.js`, `style.css`)
- **Review 2:** React frontend
- **Now:** React + Express/MongoDB full-stack app, deployable on Vercel

## Features

**Students**
- Sign up with name, registration number, email and password. Registration numbers are unique, and sign-up can be limited to university email domains.
- Submit complaints with hostel, block, room, type, description and an urgent flag. Blocks are checked against the chosen hostel.
- See their own complaints and statuses, with a type filter and a refresh button.
- Change their password.

**Wardens**
- See every complaint, urgent first, with server-side paging, a status filter, and Open/Completed counts.
- Mark complaints Pending, In Progress or Completed.
- Reset a student's password to a one-time temporary password. The student must choose a new one at their next login.

**Security**
- Passwords are hashed with bcrypt.
- Login tokens are JWTs that the server can revoke: changing or resetting a password logs that account out everywhere.
- Every route checks the user's role.
- Login and sign-up are rate-limited, and the counts are shared across serverless instances.
- All input is validated, and length limits are enforced on both the client and the server.

## Tech stack

| Part | Tech |
|---|---|
| Frontend (`vit-hostel/`) | React 18, Vite 6, plain CSS, Vitest + React Testing Library |
| Backend (`backend/`) | Node 22, Express 5, Mongoose 8, JWT, bcryptjs, node:test + supertest + mongodb-memory-server |
| Database | MongoDB Atlas |
| Hosting | Vercel (two projects from this repo) |
| CI | GitHub Actions: both test suites and the frontend build on every push and PR |

## Run locally

```bash
# backend: copy .env.example to .env and fill in MONGO_URI + JWT_SECRET
cd backend && npm install && npm run dev        # http://localhost:5000

# frontend
cd vit-hostel && npm install && npm run dev     # http://localhost:5173

# create the warden account (needs SEED_WARDEN_PASSWORD unless MONGO_URI is localhost)
cd backend && npm run seed
```

Tests: run `npm test` inside `backend/` and inside `vit-hostel/`.

## Deploy

See [DEPLOY.md](DEPLOY.md) for step-by-step MongoDB Atlas + Vercel setup and the API reference.

## Project docs

- [CLAUDE.md](CLAUDE.md): architecture and coding conventions
- [check.md](check.md): review checklist and its status

## Not built yet

- Email verification and email alerts (urgent complaint → wardens, status change → student). These need an email-sending service.
- Cleaning staff role, cleaning requests and an admin dashboard (phase 2).
