const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const request = require('supertest')

let mongod
let app
let User
let RateLimit

before(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongod.getUri()
  process.env.JWT_SECRET = 'test-secret'
  app = require('../app')
  User = require('../models/User')
  RateLimit = require('../models/RateLimit')
  await require('../lib/db')()
})

after(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase()
  await User.syncIndexes()
  // Dropping the DB also resets rate-limit counters, so each test starts fresh
  await RateLimit.syncIndexes()
})

const student = {
  name: 'Test Student',
  email: 'Student@Example.com',
  password: 'secret123',
  regNumber: '23BCE1234',
  hostelType: "Men's Hostel",
  block: 'A',
  room: '204'
}

const complaint = {
  hostelType: "Men's Hostel",
  block: 'A',
  room: '204',
  complaintType: 'WiFi Issue',
  description: 'WiFi keeps dropping',
  urgent: true
}

async function registerStudent(overrides = {}) {
  const res = await request(app).post('/api/auth/register').send({ ...student, ...overrides })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body
}

async function createWarden() {
  // Goes through the model so the password is hashed exactly once, like seed.js
  await User.create({ name: 'Warden', email: 'warden@test.com', password: 'warden123', role: 'warden' })
  const res = await request(app).post('/api/auth/login').send({ email: 'warden@test.com', password: 'warden123' })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body
}

test('health check responds', async () => {
  const res = await request(app).get('/api/health')
  assert.equal(res.status, 200)
  assert.equal(res.body.status, 'ok')
})

test('register creates a student and never returns the password', async () => {
  const body = await registerStudent()
  assert.ok(body.token)
  assert.equal(body.user.role, 'student')
  assert.equal(body.user.email, 'student@example.com')
  assert.equal(body.user.password, undefined)
})

test('register ignores a role sent by the client', async () => {
  const body = await registerStudent({ role: 'warden' })
  assert.equal(body.user.role, 'student')
})

test('register rejects missing fields and duplicate emails', async () => {
  const missing = await request(app).post('/api/auth/register').send({ email: 'a@b.com' })
  assert.equal(missing.status, 400)

  await registerStudent()
  const dup = await request(app).post('/api/auth/register').send(student)
  assert.equal(dup.status, 409)
})

test('register rejects short passwords and invalid blocks', async () => {
  const shortPw = await request(app).post('/api/auth/register').send({ ...student, password: '123' })
  assert.equal(shortPw.status, 400)

  const badBlock = await request(app).post('/api/auth/register').send({ ...student, hostelType: "Women's Hostel", block: 'T' })
  assert.equal(badBlock.status, 400)
})

test('login works with correct password and fails otherwise', async () => {
  await registerStudent()
  const ok = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'secret123' })
  assert.equal(ok.status, 200)
  assert.ok(ok.body.token)

  const bad = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'wrong' })
  assert.equal(bad.status, 401)

  const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'secret123' })
  assert.equal(unknown.status, 401)
})

test('seeded-style warden can log in (password hashed once)', async () => {
  const warden = await createWarden()
  assert.equal(warden.user.role, 'warden')
})

test('/me requires a valid token', async () => {
  const none = await request(app).get('/api/auth/me')
  assert.equal(none.status, 401)

  const garbage = await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope')
  assert.equal(garbage.status, 401)

  const { token } = await registerStudent()
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
  assert.equal(me.status, 200)
  assert.equal(me.body.regNumber, '23BCE1234')
})

test('token for a deleted user is rejected instead of crashing', async () => {
  const { token, user } = await registerStudent()
  await User.deleteOne({ _id: user._id })
  const res = await request(app).get('/api/complaints/mine').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 401)
})

test('student submits a complaint and sees only their own', async () => {
  const a = await registerStudent()
  const b = await registerStudent({ email: 'other@example.com', regNumber: '23BCE9999', name: 'Other' })

  const created = await request(app).post('/api/complaints').set('Authorization', `Bearer ${a.token}`).send(complaint)
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.equal(created.body.name, 'Test Student')
  assert.equal(created.body.reg, '23BCE1234')
  assert.equal(created.body.status, 'Pending')

  const mineA = await request(app).get('/api/complaints/mine').set('Authorization', `Bearer ${a.token}`)
  assert.equal(mineA.body.length, 1)

  const mineB = await request(app).get('/api/complaints/mine').set('Authorization', `Bearer ${b.token}`)
  assert.equal(mineB.body.length, 0)
})

test('complaint validation rejects bad input', async () => {
  const { token } = await registerStudent()
  const auth = { Authorization: `Bearer ${token}` }

  const missing = await request(app).post('/api/complaints').set(auth).send({ complaintType: 'WiFi Issue' })
  assert.equal(missing.status, 400)

  const badType = await request(app).post('/api/complaints').set(auth).send({ ...complaint, complaintType: 'Hacking' })
  assert.equal(badType.status, 400)

  const badBlock = await request(app).post('/api/complaints').set(auth).send({ ...complaint, block: 'Z' })
  assert.equal(badBlock.status, 400)
})

test('students cannot list all complaints or change status', async () => {
  const { token } = await registerStudent()
  const auth = { Authorization: `Bearer ${token}` }
  const created = await request(app).post('/api/complaints').set(auth).send(complaint)

  const all = await request(app).get('/api/complaints').set(auth)
  assert.equal(all.status, 403)

  const patch = await request(app).patch(`/api/complaints/${created.body._id}`).set(auth).send({ status: 'Completed' })
  assert.equal(patch.status, 403)
})

test('warden lists all complaints (urgent first) and updates status', async () => {
  const s = await registerStudent()
  const sAuth = { Authorization: `Bearer ${s.token}` }
  await request(app).post('/api/complaints').set(sAuth).send({ ...complaint, urgent: false, description: 'normal' })
  const urgent = await request(app).post('/api/complaints').set(sAuth).send(complaint)

  const w = await createWarden()
  const wAuth = { Authorization: `Bearer ${w.token}` }

  const all = await request(app).get('/api/complaints').set(wAuth)
  assert.equal(all.status, 200)
  assert.equal(all.body.length, 2)
  assert.equal(all.body[0].urgent, true)

  const done = await request(app).patch(`/api/complaints/${urgent.body._id}`).set(wAuth).send({ status: 'Completed' })
  assert.equal(done.status, 200)
  assert.equal(done.body.status, 'Completed')
  assert.ok(done.body.resolvedAt)

  const back = await request(app).patch(`/api/complaints/${urgent.body._id}`).set(wAuth).send({ status: 'Pending' })
  assert.equal(back.body.status, 'Pending')
  assert.equal(back.body.resolvedAt, null)

  const badStatus = await request(app).patch(`/api/complaints/${urgent.body._id}`).set(wAuth).send({ status: 'Deleted' })
  assert.equal(badStatus.status, 400)

  const badId = await request(app).patch('/api/complaints/not-an-id').set(wAuth).send({ status: 'Completed' })
  assert.equal(badId.status, 404)

  const missingId = await request(app).patch(`/api/complaints/${new mongoose.Types.ObjectId()}`).set(wAuth).send({ status: 'Completed' })
  assert.equal(missingId.status, 404)
})

test('unknown routes return JSON 404', async () => {
  const res = await request(app).get('/api/nope')
  assert.equal(res.status, 404)
  assert.equal(res.body.message, 'Route not found')
})

// --- config checks ---

test('missing JWT_SECRET fails clearly without touching the database', async () => {
  const saved = process.env.JWT_SECRET
  const originalError = console.error
  console.error = () => {}
  try {
    delete process.env.JWT_SECRET
    const res = await request(app).post('/api/auth/register').send(student)
    assert.equal(res.status, 500)
    assert.equal(res.body.message, 'Server is not configured correctly')
    assert.ok(!JSON.stringify(res.body).includes('JWT_SECRET'))

    const health = await request(app).get('/api/health')
    assert.equal(health.status, 503)
    assert.equal(health.body.status, 'misconfigured')
    assert.deepEqual(health.body.missing, ['JWT_SECRET'])
  } finally {
    process.env.JWT_SECRET = saved
    console.error = originalError
  }
  assert.equal(await User.countDocuments(), 0)
})

// --- rate limiting ---

test('login is rate limited per IP + email', async () => {
  await registerStudent()
  const wrong = { email: 'student@example.com', password: 'wrong-password' }
  for (let i = 0; i < 10; i++) {
    const res = await request(app).post('/api/auth/login').send(wrong)
    assert.equal(res.status, 401, `attempt ${i + 1}`)
  }
  const blocked = await request(app).post('/api/auth/login').send(wrong)
  assert.equal(blocked.status, 429)
  assert.match(blocked.body.message, /^Too many attempts\. Please try again in \d+ minutes?\.$/)
  const retryAfter = Number(blocked.headers['retry-after'])
  assert.ok(retryAfter > 0 && retryAfter <= 15 * 60, `Retry-After ${blocked.headers['retry-after']}`)

  const otherEmail = await request(app).post('/api/auth/login').send({ email: 'other@example.com', password: 'whatever1' })
  assert.equal(otherEmail.status, 401)
})

test('register is rate limited per IP', async () => {
  const { max } = require('../lib/constants').RATE_LIMITS.registerPerIp
  for (let i = 0; i < max; i++) {
    const res = await request(app).post('/api/auth/register').send({})
    assert.equal(res.status, 400, `attempt ${i + 1}`)
  }
  const blocked = await request(app).post('/api/auth/register').send(student)
  assert.equal(blocked.status, 429)
  assert.ok(blocked.headers['retry-after'])
  assert.equal(await User.countDocuments(), 0)
})

test('per-IP limits leave room for a hostel sharing one NAT IP', () => {
  const { RATE_LIMITS } = require('../lib/constants')
  // Hostel WiFi puts many students behind one public IP; per-IP caps must be
  // far above what one person would hit, the per-account cap does the real work
  assert.ok(RATE_LIMITS.loginPerIp.max >= 300, 'login per IP too strict for campus NAT')
  assert.ok(RATE_LIMITS.registerPerIp.max >= 100, 'register per IP too strict for campus NAT')
  assert.equal(RATE_LIMITS.loginPerIpEmail.max, 10)
})

test('register accepts an email with surrounding whitespace', async () => {
  const res = await request(app).post('/api/auth/register').send({ ...student, email: '  Spaced@Example.com ' })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  assert.equal(res.body.user.email, 'spaced@example.com')
})

test('tokens signed with another algorithm are rejected', async () => {
  const jwt = require('jsonwebtoken')
  const { user } = await registerStudent()
  const hs512 = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { algorithm: 'HS512' })
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${hs512}`)
  assert.equal(res.status, 401)
})

// --- error handler ---

test('concurrent duplicate registrations return 409, not 500', async () => {
  const results = await Promise.all([1, 2, 3].map(() => request(app).post('/api/auth/register').send(student)))
  const statuses = results.map((r) => r.status).sort()
  assert.deepEqual(statuses, [201, 409, 409])
  assert.equal(await User.countDocuments(), 1)
})

test('oversized JSON body returns 413', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ ...student, description: 'x'.repeat(150 * 1024) })
  assert.equal(res.status, 413)
  assert.equal(res.body.message, 'Request body is too large')
})

test('malformed JSON returns 400', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":')
  assert.equal(res.status, 400)
  assert.equal(res.body.message, 'Invalid JSON body')
})

// --- length limits ---

test('register rejects overlong name and password', async () => {
  const longName = await request(app).post('/api/auth/register').send({ ...student, name: 'n'.repeat(101) })
  assert.equal(longName.status, 400)
  assert.equal(longName.body.message, 'Name is too long (max 100 characters)')

  const longPw = await request(app).post('/api/auth/register').send({ ...student, password: 'p'.repeat(73) })
  assert.equal(longPw.status, 400)
  assert.equal(longPw.body.message, 'Password is too long (max 72 characters)')

  const okPw = await request(app).post('/api/auth/register').send({ ...student, password: 'p'.repeat(72) })
  assert.equal(okPw.status, 201)
})

test('login rejects overlong email or password with 400', async () => {
  const longPw = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'p'.repeat(73) })
  assert.equal(longPw.status, 400)
  const longEmail = await request(app).post('/api/auth/login').send({ email: `${'e'.repeat(250)}@b.com`, password: 'secret123' })
  assert.equal(longEmail.status, 400)
})

test('complaint rejects overlong room and description', async () => {
  const { token } = await registerStudent()
  const auth = { Authorization: `Bearer ${token}` }

  const longRoom = await request(app).post('/api/complaints').set(auth).send({ ...complaint, room: 'r'.repeat(21) })
  assert.equal(longRoom.status, 400)
  assert.equal(longRoom.body.message, 'Room is too long (max 20 characters)')

  const longDesc = await request(app).post('/api/complaints').set(auth).send({ ...complaint, description: 'd'.repeat(2001) })
  assert.equal(longDesc.status, 400)
  assert.equal(longDesc.body.message, 'Description is too long (max 2000 characters)')
})

// --- status transitions ---

test('resolvedAt only changes on a real transition to or from Completed', async () => {
  const s = await registerStudent()
  const created = await request(app).post('/api/complaints').set('Authorization', `Bearer ${s.token}`).send(complaint)
  const w = await createWarden()
  const wAuth = { Authorization: `Bearer ${w.token}` }
  const url = `/api/complaints/${created.body._id}`

  const first = await request(app).patch(url).set(wAuth).send({ status: 'Completed' })
  assert.equal(first.status, 200)
  assert.ok(first.body.resolvedAt)

  await new Promise((resolve) => setTimeout(resolve, 20))
  const again = await request(app).patch(url).set(wAuth).send({ status: 'Completed' })
  assert.equal(again.status, 200)
  assert.equal(again.body.resolvedAt, first.body.resolvedAt)

  const progress = await request(app).patch(url).set(wAuth).send({ status: 'In Progress' })
  assert.equal(progress.status, 200)
  assert.equal(progress.body.status, 'In Progress')
  assert.equal(progress.body.resolvedAt, null)
})

// --- CORS ---

test('CORS allows the default dev origin and rejects others', async () => {
  const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173')

  const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example')
  assert.equal(evil.headers['access-control-allow-origin'], undefined)
})
