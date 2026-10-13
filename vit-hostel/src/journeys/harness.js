// Full-stack journey harness: the REAL backend Express app (backend/app.js) on
// a random local port, backed by mongodb-memory-server, plus the REAL <App />
// rendered in jsdom and talking to it over HTTP with Node's fetch. Nothing is
// stubbed. Never points at Atlas or any real database.
//
// The backend is CommonJS with its own node_modules, so it's loaded through a
// require() anchored at backend/package.json. That makes 'mongoose',
// 'mongodb-memory-server' and './app' resolve exactly as they do for the
// backend's own tests (one mongoose instance shared by app and helpers).
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { createElement } from 'react'

// Set by vitest.journeys.config.js (import.meta.url is an http:// URL in jsdom)
const backendDir = process.env.JOURNEY_BACKEND_DIR
if (!backendDir) throw new Error('Run journeys with `npm run test:journeys` (vitest.journeys.config.js)')
const backendRequire = createRequire(path.join(backendDir, 'package.json'))

// mongodb-memory-server looks for its binary cache next to the package.json in
// the current directory (vit-hostel), where nothing is cached. Point it at the
// backend's cache so the already-downloaded binary is reused.
const backendBinaryCache = path.join(backendDir, 'node_modules', '.cache', 'mongodb-memory-server')
if (!process.env.MONGOMS_DOWNLOAD_DIR && existsSync(backendBinaryCache)) {
  process.env.MONGOMS_DOWNLOAD_DIR = backendBinaryCache
}

export const JOURNEY_JWT_SECRET = 'journey-test-secret'
// Unroutable on purpose: nothing listens on port 1
export const UNREACHABLE_MONGO_URI = 'mongodb://127.0.0.1:1/unreachable'

// Starts the backend. db: true → a fresh in-memory MongoDB; db: false → an
// unreachable URI (for the "database down" journey). Env is set BEFORE the app
// is required, because app.js reads ALLOWED_ORIGINS at load time.
export async function startBackend({ db = true } = {}) {
  let mongod = null
  if (db) {
    const { MongoMemoryServer } = backendRequire('mongodb-memory-server')
    mongod = await MongoMemoryServer.create()
  }

  process.env.MONGO_URI = mongod ? mongod.getUri() : UNREACHABLE_MONGO_URI
  process.env.JWT_SECRET = JOURNEY_JWT_SECRET
  process.env.LOG_LEVEL = 'silent'
  process.env.BCRYPT_ROUNDS = '4'
  // jsdom's origin, i.e. where the "browser" page lives
  process.env.ALLOWED_ORIGINS = window.location.origin
  delete process.env.VERCEL
  delete process.env.ALLOWED_EMAIL_DOMAINS

  const mongoose = backendRequire('mongoose')
  const app = backendRequire('./app')
  const User = backendRequire('./models/User')
  const Complaint = backendRequire('./models/Complaint')
  const RateLimit = backendRequire('./models/RateLimit')

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const url = `http://127.0.0.1:${server.address().port}`

  // Empties the database between tests (also resets the rate-limit counters)
  // and rebuilds the unique indexes the routes rely on for 409s
  async function resetDb() {
    if (!mongod) return
    await backendRequire('./lib/db')()
    await mongoose.connection.db.dropDatabase()
    await User.syncIndexes()
    await RateLimit.syncIndexes()
    await Complaint.syncIndexes()
  }

  async function stop() {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await mongoose.disconnect()
    // lib/db.js caches the connection promise on global; clear it so nothing
    // reuses a connection to a server that no longer exists
    if (global._mongoose) global._mongoose.promise = null
    if (mongod) await mongod.stop()
  }

  return { url, app, mongod, mongoose, User, Complaint, resetDb, stop }
}

// Renders the real <App /> pointed at the backend. src/api.js reads
// import.meta.env.VITE_API_URL once at module load, so the env is stubbed
// first and App (with api.js) is imported afresh after a module reset.
let AppComponent = null
export async function loadApp(url) {
  vi.stubEnv('VITE_API_URL', url)
  vi.resetModules()
  AppComponent = (await import('../App.jsx')).default
  return AppComponent
}

export function renderApp() {
  if (!AppComponent) throw new Error('Call loadApp(url) in beforeAll first')
  return render(createElement(AppComponent))
}

export const TOKEN_KEY = 'vit-hostel-token'

// A direct API call from "another device" (no UI), e.g. to log out elsewhere
export async function api(url, path, { method = 'GET', token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

export const student = {
  name: 'Asha Rao',
  regNumber: '23BCE1234',
  email: 'asha@vitstudent.ac.in',
  password: 'hostel-pass-1',
  hostelType: "Men's Hostel",
  block: 'C',
  room: '204'
}

export const warden = { name: 'Warden Kumar', email: 'warden@vit.ac.in', password: 'warden-pass-1' }

// Seeds a warden the way seed.js does: through the model with a plain password
// (the pre-save hook hashes it exactly once)
export function seedWarden(User) {
  return User.create({ ...warden, role: 'warden' })
}
