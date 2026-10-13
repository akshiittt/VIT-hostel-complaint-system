// Regression tests for the backend audit findings (H1–L9). Runs with
// VERCEL=1 so X-Forwarded-For is trusted, which lets one test simulate many
// client IPs.
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const request = require('supertest')

let mongod
let app
let User
let Complaint
let RateLimit

before(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongod.getUri()
  process.env.JWT_SECRET = 'test-secret'
  process.env.VERCEL = '1'
  process.env.LOG_LEVEL = 'silent'
  // Low cost keeps the suite fast; production always uses the default 12
  process.env.BCRYPT_ROUNDS = '4'
  app = require('../app')
  User = require('../models/User')
  Complaint = require('../models/Complaint')
  RateLimit = require('../models/RateLimit')
  await require('../lib/db')()
})

after(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase()
  await Promise.all([User.syncIndexes(), RateLimit.syncIndexes(), Complaint.syncIndexes()])
})

const student = {
  name: 'Audit Student',
  email: 'audit@example.com',
  password: 'solid-pass-1',
  regNumber: '23BCE1234',
  hostelType: "Men's Hostel",
  block: 'A',
  room: '101'
}
const complaint = { hostelType: "Men's Hostel", block: 'A', room: '101', complaintType: 'WiFi Issue', description: 'Router down', urgent: false }

async function registerStudent(overrides = {}) {
  const res = await request(app).post('/api/auth/register').set('X-Forwarded-For', `10.9.${Math.floor(Math.random() * 250)}.1`).send({ ...student, ...overrides })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body
}

async function createWarden(email = 'warden@example.com') {
  await User.create({ name: 'Warden', email, password: 'warden-password-1', role: 'warden' })
  const res = await request(app).post('/api/auth/login').send({ email, password: 'warden-password-1' })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` })

// --- H1: complaint abuse ---

test('H1: a student can file at most 10 complaints an hour', async () => {
  const { token } = await registerStudent()
  for (let i = 0; i < 10; i++) {
    const res = await request(app).post('/api/complaints').set(bearer(token)).send({ ...complaint, description: `Issue ${i}` })
    assert.equal(res.status, 201, `complaint ${i + 1}`)
  }
  const blocked = await request(app).post('/api/complaints').set(bearer(token)).send({ ...complaint, description: 'Issue 11' })
  assert.equal(blocked.status, 429)
  assert.ok(blocked.headers['retry-after'])
})

test('H1: at most 3 urgent complaints a day, non-urgent still allowed', async () => {
  const { token } = await registerStudent()
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/complaints').set(bearer(token)).send({ ...complaint, urgent: true, description: `Urgent ${i}` })
    assert.equal(res.status, 201)
  }
  const blocked = await request(app).post('/api/complaints').set(bearer(token)).send({ ...complaint, urgent: true, description: 'Urgent 4' })
  assert.equal(blocked.status, 429)
  assert.match(blocked.body.message, /urgent/i)
  const normal = await request(app).post('/api/complaints').set(bearer(token)).send({ ...complaint, description: 'Not urgent' })
  assert.equal(normal.status, 201)
})

test('H1: an identical complaint within 10 minutes is rejected as a duplicate', async () => {
  const { token } = await registerStudent()
  const first = await request(app).post('/api/complaints').set(bearer(token)).send(complaint)
  assert.equal(first.status, 201)
  const again = await request(app).post('/api/complaints').set(bearer(token)).send({ ...complaint, description: '  Router down  ' })
  assert.equal(again.status, 409)
  assert.equal(again.body.message, 'You already submitted this complaint a moment ago')
  assert.equal(await Complaint.countDocuments(), 1)

  // A different student may report the same problem
  const other = await registerStudent({ email: 'other@example.com', regNumber: '23BCE5678' })
  assert.equal((await request(app).post('/api/complaints').set(bearer(other.token)).send(complaint)).status, 201)
})

// --- H2: login brute force across IPs ---

test('H2: one account gets at most 30 login attempts an hour, whatever the IP', async () => {
  const wrong = { email: 'warden@example.com', password: 'guess-guess' }
  for (let i = 0; i < 30; i++) {
    const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', `172.16.${i}.1`).send(wrong)
    assert.equal(res.status, 401, `attempt ${i + 1}`)
  }
  const blocked = await request(app).post('/api/auth/login').set('X-Forwarded-For', '172.16.200.1').send(wrong)
  assert.equal(blocked.status, 429)
  // Other accounts are unaffected
  const other = await request(app).post('/api/auth/login').set('X-Forwarded-For', '172.16.201.1').send({ email: 'someone@example.com', password: 'guess-guess' })
  assert.equal(other.status, 401)
})

// --- M1: warden resets leave a trail ---

test('M1: a reset records who did it and when, and logs it without the password', async () => {
  const s = await registerStudent()
  const w = await createWarden()
  const lines = []
  const original = console.log
  process.env.LOG_LEVEL = 'info'
  console.log = (line) => lines.push(String(line))
  let reset
  try {
    reset = await request(app).post('/api/auth/reset-password').set(bearer(w.token)).send({ email: student.email })
  } finally {
    console.log = original
    process.env.LOG_LEVEL = 'silent'
  }
  assert.equal(reset.status, 200)

  const stored = await User.findById(s.user._id).lean()
  assert.ok(stored.passwordResetAt instanceof Date)
  assert.equal(String(stored.passwordResetBy), String(w.user._id))

  const audit = lines.map((l) => JSON.parse(l)).find((e) => e.event === 'password_reset')
  assert.ok(audit, 'audit line emitted')
  assert.equal(audit.studentId, String(s.user._id))
  assert.equal(audit.wardenId, String(w.user._id))
  assert.ok(!lines.join('\n').includes(reset.body.temporaryPassword), 'temporary password never logged')

  const login = await request(app).post('/api/auth/login').send({ email: student.email, password: reset.body.temporaryPassword })
  assert.ok(login.body.user.passwordResetAt, 'student is told when the reset happened')
})

test('L7: a warden can reset at most 20 passwords an hour', async () => {
  const w = await createWarden()
  for (let i = 0; i < 20; i++) {
    const res = await request(app).post('/api/auth/reset-password').set(bearer(w.token)).send({ email: 'nobody@example.com' })
    assert.equal(res.status, 404)
  }
  const blocked = await request(app).post('/api/auth/reset-password').set(bearer(w.token)).send({ email: 'nobody@example.com' })
  assert.equal(blocked.status, 429)
})

// --- M2 / M4: sign-up data quality and password strength ---

test('M2: registration numbers must look like a VIT number', async () => {
  for (const bad of ['X', '23BCE12', 'BCE231234', '23-BCE-1234']) {
    const res = await request(app).post('/api/auth/register').send({ ...student, regNumber: bad })
    assert.equal(res.status, 400, bad)
    assert.equal(res.body.message, 'Please enter a valid registration number (e.g. 23BCE1234)')
  }
  const lower = await request(app).post('/api/auth/register').send({ ...student, regNumber: ' 21mis0042 ' })
  assert.equal(lower.status, 201)
  assert.equal(lower.body.user.regNumber, '21MIS0042')
})

test('M4: passwords need 8+ characters and must not be common', async () => {
  const short = await request(app).post('/api/auth/register').send({ ...student, password: 'abc1234' })
  assert.equal(short.status, 400)
  assert.equal(short.body.message, 'Password must be at least 8 characters')

  const common = await request(app).post('/api/auth/register').send({ ...student, password: 'Password123' })
  assert.equal(common.status, 400)
  assert.equal(common.body.message, 'This password is too common. Please choose another.')

  const s = await registerStudent()
  const change = await request(app).post('/api/auth/change-password').set(bearer(s.token))
    .send({ currentPassword: student.password, newPassword: '12345678' })
  assert.equal(change.status, 400)
  assert.equal(change.body.message, 'This password is too common. Please choose another.')
})

// --- M5: request logging ---

test('M5: every request is logged as one JSON line without bodies or tokens', async () => {
  const s = await registerStudent()
  const lines = []
  const original = console.log
  process.env.LOG_LEVEL = 'info'
  console.log = (line) => lines.push(String(line))
  try {
    await request(app).get('/api/complaints/mine?x=1').set(bearer(s.token))
    await request(app).post('/api/auth/login').send({ email: student.email, password: 'wrong-password' })
  } finally {
    console.log = original
    process.env.LOG_LEVEL = 'silent'
  }
  const events = lines.map((l) => JSON.parse(l))
  const mine = events.find((e) => e.event === 'request' && e.path === '/api/complaints/mine')
  assert.ok(mine, JSON.stringify(events))
  assert.equal(mine.method, 'GET')
  assert.equal(mine.status, 200)
  assert.equal(mine.userId, String(s.user._id))
  assert.equal(typeof mine.ms, 'number')
  assert.ok(events.some((e) => e.event === 'login_failed'))
  const all = lines.join('\n')
  assert.ok(!all.includes(s.token), 'token never logged')
  assert.ok(!all.includes('wrong-password'), 'password never logged')
  assert.ok(!all.includes('x=1'), 'query strings are not logged')
})

// --- L1–L6 ---

test('L1: complaint responses do not expose __v', async () => {
  const { token } = await registerStudent()
  const res = await request(app).post('/api/complaints').set(bearer(token)).send(complaint)
  assert.equal(res.body.__v, undefined)
  assert.ok(res.body._id)
})

test('L2/L3: auth responses are not cacheable and headers are hardened', async () => {
  const res = await request(app).post('/api/auth/register').send(student)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.headers['x-powered-by'], undefined)
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
})

test('L4: unknown /api paths are 404 even when config is missing', async () => {
  const saved = process.env.JWT_SECRET
  delete process.env.JWT_SECRET
  try {
    const res = await request(app).get('/api/nope')
    assert.equal(res.status, 404)
  } finally {
    process.env.JWT_SECRET = saved
  }
})

test('L5: the complaint schema rejects an invalid hostel or block', async () => {
  const base = { studentId: new mongoose.Types.ObjectId(), name: 'N', room: '1', complaintType: 'Others', description: 'd' }
  await assert.rejects(Complaint.create({ ...base, hostelType: 'Mars Hostel', block: 'A' }), /hostelType/)
  await assert.rejects(Complaint.create({ ...base, hostelType: "Women's Hostel", block: 'T' }), /block/)
  await Complaint.create({ ...base, hostelType: "Women's Hostel", block: 'J' })
})

test('L6: /mine returns at most the latest 100 complaints', async () => {
  const s = await registerStudent()
  await Complaint.insertMany(Array.from({ length: 105 }, (_, i) => ({
    ...complaint,
    studentId: s.user._id,
    name: student.name,
    description: `Old ${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, i))
  })))
  const res = await request(app).get('/api/complaints/mine').set(bearer(s.token))
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 100)
  assert.equal(res.body[0].description, 'Old 104')
})

test('L9: tokenVersion is bumped atomically by password changes', async () => {
  const s = await registerStudent()
  const res = await request(app).post('/api/auth/change-password').set(bearer(s.token))
    .send({ currentPassword: student.password, newPassword: 'another-solid-2' })
  assert.equal(res.status, 200)
  const stored = await User.findById(s.user._id).lean()
  assert.equal(stored.tokenVersion, 1)
  const me = await request(app).get('/api/auth/me').set(bearer(res.body.token))
  assert.equal(me.status, 200)
})

// --- Security audit fixes (M3, L4) ---

test('M3: login tokens expire after one day', async () => {
  const { token } = await registerStudent()
  const { iat, exp } = require('jsonwebtoken').decode(token)
  assert.equal(exp - iat, 24 * 60 * 60)
})

test('M3: logout ends the session on the server', async () => {
  const s = await registerStudent()
  const out = await request(app).post('/api/auth/logout').set(bearer(s.token))
  assert.equal(out.status, 204)
  assert.equal(out.headers['cache-control'], 'no-store')

  const after = await request(app).get('/api/auth/me').set(bearer(s.token))
  assert.equal(after.status, 401)
  assert.equal(after.body.message, 'Session expired, please log in again')

  const again = await request(app).post('/api/auth/login').send({ email: student.email, password: student.password })
  assert.equal(again.status, 200)
  assert.equal((await request(app).get('/api/auth/me').set(bearer(again.body.token))).status, 200)
})

test('M3: logout without a valid token is a 401, not a crash', async () => {
  const res = await request(app).post('/api/auth/logout')
  assert.equal(res.status, 401)
})

test('L4: bcrypt uses 12 rounds unless a test overrides it', () => {
  const { bcryptRounds } = require('../lib/passwordPolicy')
  const saved = process.env.BCRYPT_ROUNDS
  try {
    delete process.env.BCRYPT_ROUNDS
    assert.equal(bcryptRounds(), 12)
    process.env.BCRYPT_ROUNDS = 'abc'
    assert.equal(bcryptRounds(), 12)
    process.env.BCRYPT_ROUNDS = '2'
    assert.equal(bcryptRounds(), 12, 'values below 4 are ignored')
    process.env.BCRYPT_ROUNDS = '4'
    assert.equal(bcryptRounds(), 4)
  } finally {
    if (saved === undefined) delete process.env.BCRYPT_ROUNDS
    else process.env.BCRYPT_ROUNDS = saved
  }
})

test('L4: new password hashes use the configured cost', async () => {
  const s = await registerStudent()
  const stored = await User.findById(s.user._id).select('+password').lean()
  const cost = Number(stored.password.split('$')[2])
  assert.equal(cost, require('../lib/passwordPolicy').bcryptRounds())
})

test('L4: an older, cheaper hash is upgraded on the next successful login', async () => {
  const s = await registerStudent() // hashed at the suite's cost (4)
  const costOf = async () => Number((await User.findById(s.user._id).select('+password').lean()).password.split('$')[2])
  assert.equal(await costOf(), 4)

  process.env.BCRYPT_ROUNDS = '5'
  try {
    const wrong = await request(app).post('/api/auth/login').send({ email: student.email, password: 'not-the-password' })
    assert.equal(wrong.status, 401)
    assert.equal(await costOf(), 4, 'a failed login changes nothing')

    const ok = await request(app).post('/api/auth/login').send({ email: student.email, password: student.password })
    assert.equal(ok.status, 200)
    assert.equal(await costOf(), 5)
    // The upgrade must not end the session it just created
    assert.equal((await request(app).get('/api/auth/me').set(bearer(ok.body.token))).status, 200)
  } finally {
    process.env.BCRYPT_ROUNDS = '4'
  }
})
