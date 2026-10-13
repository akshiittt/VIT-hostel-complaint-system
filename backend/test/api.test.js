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
  process.env.LOG_LEVEL = 'silent'
  delete process.env.VERCEL
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
  assert.equal(all.body.complaints.length, 2)
  assert.equal(all.body.complaints[0].urgent, true)

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

// --- sign-up identity checks ---

async function withEnv(name, value, fn) {
  const saved = process.env[name]
  try {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
    return await fn()
  } finally {
    if (saved === undefined) delete process.env[name]
    else process.env[name] = saved
  }
}

test('register rejects emails outside ALLOWED_EMAIL_DOMAINS when it is set', async () => {
  await withEnv('ALLOWED_EMAIL_DOMAINS', 'vitstudent.ac.in', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...student, email: 'someone@gmail.com' })
    assert.equal(res.status, 400)
    assert.equal(res.body.message, 'Please use your university email (@vitstudent.ac.in)')

    // The domain is the part after the last '@'
    const tricky = await request(app).post('/api/auth/register').send({ ...student, email: 'a@vitstudent.ac.in@gmail.com' })
    assert.equal(tricky.status, 400)
    assert.equal(await User.countDocuments(), 0)
  })
})

test('register lists every allowed domain in the message', async () => {
  await withEnv('ALLOWED_EMAIL_DOMAINS', 'vitstudent.ac.in, vit.ac.in', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...student, email: 'someone@gmail.com' })
    assert.equal(res.status, 400)
    assert.equal(res.body.message, 'Please use your university email (@vitstudent.ac.in or @vit.ac.in)')
  })
})

test('register accepts an allowed domain regardless of case', async () => {
  await withEnv('ALLOWED_EMAIL_DOMAINS', 'VITStudent.ac.in', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...student, email: ' Someone@VITSTUDENT.AC.IN ' })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.user.email, 'someone@vitstudent.ac.in')
  })
})

test('register accepts any domain when ALLOWED_EMAIL_DOMAINS is unset or empty', async () => {
  await withEnv('ALLOWED_EMAIL_DOMAINS', undefined, async () => {
    const res = await request(app).post('/api/auth/register').send({ ...student, email: 'someone@gmail.com' })
    assert.equal(res.status, 201, JSON.stringify(res.body))
  })
  await withEnv('ALLOWED_EMAIL_DOMAINS', '  ', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...student, email: 'else@yahoo.com', regNumber: '23BCE0002' })
    assert.equal(res.status, 201, JSON.stringify(res.body))
  })
})

test('register rejects a registration number that is already registered', async () => {
  await registerStudent()
  const dup = await request(app).post('/api/auth/register').send({ ...student, email: 'other@example.com', regNumber: '  23bce1234 ' })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.message, 'This registration number is already registered')
  assert.equal(await User.countDocuments(), 1)
})

test('wardens without a registration number do not clash with each other', async () => {
  await User.create({ name: 'W1', email: 'w1@test.com', password: 'warden123', role: 'warden' })
  await User.create({ name: 'W2', email: 'w2@test.com', password: 'warden123', role: 'warden' })
  assert.equal(await User.countDocuments({ role: 'warden' }), 2)
})

test('concurrent duplicate registration numbers return 409, not 500', async () => {
  const results = await Promise.all([1, 2, 3].map((i) =>
    request(app).post('/api/auth/register').send({ ...student, email: `racer${i}@example.com` })
  ))
  const statuses = results.map((r) => r.status).sort()
  assert.deepEqual(statuses, [201, 409, 409])
  for (const r of results.filter((r) => r.status === 409)) {
    assert.equal(r.body.message, 'This registration number is already registered')
  }
  assert.equal(await User.countDocuments(), 1)
})

test('duplicate-key errors on email keep the email message', async () => {
  const results = await Promise.all([1, 2].map((i) =>
    request(app).post('/api/auth/register').send({ ...student, regNumber: `23BCE000${i}` })
  ))
  const conflict = results.find((r) => r.status === 409)
  assert.ok(conflict)
  assert.equal(conflict.body.message, 'An account with this email already exists')
})

// --- sessions and passwords ---

const auth = (token) => ({ Authorization: `Bearer ${token}` })

test('user responses include mustChangePassword but never tokenVersion', async () => {
  const body = await registerStudent()
  assert.equal(body.user.mustChangePassword, false)
  assert.equal(body.user.tokenVersion, undefined)
  const me = await request(app).get('/api/auth/me').set(auth(body.token))
  assert.equal(me.body.mustChangePassword, false)
  assert.equal(me.body.tokenVersion, undefined)
})

test('tokens carry the token version and a stale version is rejected', async () => {
  const jwt = require('jsonwebtoken')
  const { token, user } = await registerStudent()
  assert.equal(jwt.decode(token).v, 0)

  // Tokens issued before versioning (no v) still work while the version is 0
  const legacy = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' })
  assert.equal((await request(app).get('/api/auth/me').set(auth(legacy))).status, 200)

  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } })
  for (const t of [token, legacy]) {
    const res = await request(app).get('/api/auth/me').set(auth(t))
    assert.equal(res.status, 401)
    assert.equal(res.body.message, 'Session expired, please log in again')
  }
})

test('change-password requires a login', async () => {
  const res = await request(app).post('/api/auth/change-password').send({ currentPassword: 'secret123', newPassword: 'newpass123' })
  assert.equal(res.status, 401)
})

test('change-password validates input', async () => {
  const { token } = await registerStudent()
  const send = (body) => request(app).post('/api/auth/change-password').set(auth(token)).send(body)

  const cases = [
    [{}, 'Please fill in all required fields'],
    [{ currentPassword: 'secret123', newPassword: '   ' }, 'Please fill in all required fields'],
    [{ currentPassword: { $ne: '' }, newPassword: 'newpass123' }, 'Please fill in all required fields'],
    [{ currentPassword: 'secret123', newPassword: '1234567' }, 'Password must be at least 8 characters'],
    [{ currentPassword: 'secret123', newPassword: 'é'.repeat(37) }, 'Password is too long (max 72 characters)'],
    [{ currentPassword: 'secret123', newPassword: 'secret123' }, 'New password must be different from the current one'],
    [{ currentPassword: 'wrong-one', newPassword: 'newpass123' }, 'Current password is incorrect']
  ]
  for (const [body, message] of cases) {
    const res = await send(body)
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.equal(res.body.message, message)
  }

  // Nothing changed: the old password and token still work
  const login = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'secret123' })
  assert.equal(login.status, 200)
  assert.equal((await request(app).get('/api/auth/me').set(auth(token))).status, 200)
})

test('change-password updates the password and revokes old tokens', async () => {
  const { token } = await registerStudent()
  const res = await request(app).post('/api/auth/change-password').set(auth(token))
    .send({ currentPassword: 'secret123', newPassword: 'newpass123' })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.ok(res.body.token)
  assert.equal(res.body.user.email, 'student@example.com')
  assert.equal(res.body.user.mustChangePassword, false)
  assert.equal(res.body.user.password, undefined)

  assert.equal((await request(app).get('/api/auth/me').set(auth(token))).status, 401)
  assert.equal((await request(app).get('/api/auth/me').set(auth(res.body.token))).status, 200)

  const oldLogin = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'secret123' })
  assert.equal(oldLogin.status, 401)
  // Hashed exactly once by the pre-save hook
  const newLogin = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'newpass123' })
  assert.equal(newLogin.status, 200)
})

test('change-password is rate limited per user', async () => {
  const { token } = await registerStudent()
  const { max } = require('../lib/constants').RATE_LIMITS.changePasswordPerUser
  assert.equal(max, 10)
  for (let i = 0; i < max; i++) {
    const res = await request(app).post('/api/auth/change-password').set(auth(token))
      .send({ currentPassword: 'wrong-one', newPassword: 'newpass123' })
    assert.equal(res.status, 400, `attempt ${i + 1}`)
  }
  const blocked = await request(app).post('/api/auth/change-password').set(auth(token))
    .send({ currentPassword: 'secret123', newPassword: 'newpass123' })
  assert.equal(blocked.status, 429)
  assert.ok(blocked.headers['retry-after'])

  // Another user is unaffected
  const other = await registerStudent({ email: 'other@example.com', regNumber: '23BCE9999' })
  const ok = await request(app).post('/api/auth/change-password').set(auth(other.token))
    .send({ currentPassword: 'secret123', newPassword: 'newpass123' })
  assert.equal(ok.status, 200)
})

test('warden resets a student password and the student must change it', async () => {
  const s = await registerStudent()
  const w = await createWarden()

  const logs = []
  const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  for (const k of Object.keys(originals)) console[k] = (...args) => logs.push(args.join(' '))
  let reset
  try {
    reset = await request(app).post('/api/auth/reset-password').set(auth(w.token)).send({ email: '  STUDENT@example.com ' })
  } finally {
    Object.assign(console, originals)
  }
  assert.equal(reset.status, 200, JSON.stringify(reset.body))
  assert.equal(reset.body.email, 'student@example.com')
  const temp = reset.body.temporaryPassword
  assert.match(temp, /^[A-Za-z2-9]{12}$/)
  assert.deepEqual(Object.keys(reset.body).sort(), ['email', 'temporaryPassword'])
  assert.ok(!logs.some((line) => line.includes(temp)), 'temporary password was logged')

  const old = await request(app).get('/api/auth/me').set(auth(s.token))
  assert.equal(old.status, 401)
  assert.equal(old.body.message, 'Session expired, please log in again')

  const oldPw = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'secret123' })
  assert.equal(oldPw.status, 401)

  const login = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: temp })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.mustChangePassword, true)

  const changed = await request(app).post('/api/auth/change-password').set(auth(login.body.token))
    .send({ currentPassword: temp, newPassword: 'brandnew1' })
  assert.equal(changed.status, 200, JSON.stringify(changed.body))
  assert.equal(changed.body.user.mustChangePassword, false)

  const me = await request(app).get('/api/auth/me').set(auth(changed.body.token))
  assert.equal(me.status, 200)
  assert.equal(me.body.mustChangePassword, false)
  assert.equal((await request(app).get('/api/auth/me').set(auth(login.body.token))).status, 401)

  // The warden's own session is untouched
  assert.equal((await request(app).get('/api/auth/me').set(auth(w.token))).status, 200)
})

test('reset-password is warden only and only for student accounts', async () => {
  const s = await registerStudent()
  const w = await createWarden()

  const asStudent = await request(app).post('/api/auth/reset-password').set(auth(s.token)).send({ email: 'student@example.com' })
  assert.equal(asStudent.status, 403)

  const anon = await request(app).post('/api/auth/reset-password').send({ email: 'student@example.com' })
  assert.equal(anon.status, 401)

  const blank = await request(app).post('/api/auth/reset-password').set(auth(w.token)).send({ email: '  ' })
  assert.equal(blank.status, 400)
  assert.equal(blank.body.message, "Please enter the student's email")

  const injection = await request(app).post('/api/auth/reset-password').set(auth(w.token)).send({ email: { $ne: '' } })
  assert.equal(injection.status, 400)

  await User.create({ name: 'W2', email: 'w2@test.com', password: 'warden123', role: 'warden' })
  for (const email of ['w2@test.com', 'warden@test.com', 'nobody@example.com']) {
    const res = await request(app).post('/api/auth/reset-password').set(auth(w.token)).send({ email })
    assert.equal(res.status, 404, email)
    assert.equal(res.body.message, 'No student account with that email')
  }

  // The other warden can still log in with their own password
  const w2 = await request(app).post('/api/auth/login').send({ email: 'w2@test.com', password: 'warden123' })
  assert.equal(w2.status, 200)
})

// --- health ---

test('health check pings the database', async () => {
  const res = await request(app).get('/api/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok', db: 'ok' })
})

test('health check reports an unreachable database without leaking the error', async () => {
  const db = mongoose.connection.db
  const originalError = console.error
  const logged = []
  console.error = (...args) => logged.push(args)
  db.admin = () => ({ ping: () => Promise.reject(new Error('secret-host-details')) })
  try {
    const res = await request(app).get('/api/health')
    assert.equal(res.status, 503)
    assert.deepEqual(res.body, { status: 'error', db: 'unreachable' })
    assert.ok(logged.length > 0, 'real error should be logged')
  } finally {
    delete db.admin
    console.error = originalError
  }
  assert.equal((await request(app).get('/api/health')).status, 200)
})

// --- warden list: filters and paging ---

async function seedComplaints(specs) {
  const Complaint = require('../models/Complaint')
  const studentId = new mongoose.Types.ObjectId()
  const base = Date.now() - specs.length * 1000
  await Complaint.insertMany(specs.map((spec, i) => ({
    studentId,
    name: 'Seeded',
    reg: '23BCE0000',
    hostelType: "Men's Hostel",
    block: 'A',
    room: '101',
    complaintType: 'Others',
    description: `complaint ${i}`,
    urgent: false,
    status: 'Pending',
    createdAt: new Date(base + i * 1000),
    ...spec
  })))
}

test('warden list returns a page with totals and overall counts', async () => {
  await seedComplaints([
    { status: 'Pending' }, { status: 'Pending', urgent: true }, { status: 'In Progress' },
    { status: 'Completed' }, { status: 'Completed' }
  ])
  const w = await createWarden()
  const res = await request(app).get('/api/complaints').set(auth(w.token))
  assert.equal(res.status, 200)
  assert.equal(res.body.page, 1)
  assert.equal(res.body.limit, 20)
  assert.equal(res.body.total, 5)
  assert.equal(res.body.pages, 1)
  assert.deepEqual(res.body.counts, { total: 5, open: 3, completed: 2 })
  assert.equal(res.body.complaints.length, 5)
  assert.equal(res.body.complaints[0].urgent, true)
  // Then newest first
  assert.equal(res.body.complaints[1].description, 'complaint 4')
})

test('warden list filters by status but counts stay global', async () => {
  await seedComplaints([
    { status: 'Pending' }, { status: 'Pending' }, { status: 'In Progress' },
    { status: 'Completed' }, { status: 'Completed' }, { status: 'Completed' }
  ])
  const w = await createWarden()
  const expected = { all: 6, open: 3, Pending: 2, 'In Progress': 1, Completed: 3 }
  for (const [status, total] of Object.entries(expected)) {
    const res = await request(app).get('/api/complaints').query({ status }).set(auth(w.token))
    assert.equal(res.status, 200, status)
    assert.equal(res.body.total, total, status)
    assert.equal(res.body.complaints.length, total, status)
    assert.deepEqual(res.body.counts, { total: 6, open: 3, completed: 3 }, status)
    if (status === 'open') assert.ok(res.body.complaints.every((c) => c.status !== 'Completed'))
    else if (status !== 'all') assert.ok(res.body.complaints.every((c) => c.status === status), status)
  }
})

test('warden list rejects an unknown status filter', async () => {
  const w = await createWarden()
  for (const status of ['Deleted', 'pending', '']) {
    const res = await request(app).get('/api/complaints').query({ status }).set(auth(w.token))
    assert.equal(res.status, 400, JSON.stringify(status))
    assert.equal(res.body.message, 'Invalid status filter')
  }
  // Repeated params arrive as an array, never a filter string
  const injected = await request(app).get('/api/complaints?status=Pending&status=Completed').set(auth(w.token))
  assert.equal(injected.status, 400)
})

test('warden list pages through results', async () => {
  await seedComplaints(Array.from({ length: 25 }, () => ({})))
  const w = await createWarden()
  const get = (query) => request(app).get('/api/complaints').query(query).set(auth(w.token))

  const p1 = await get({ limit: 10 })
  assert.equal(p1.body.complaints.length, 10)
  assert.equal(p1.body.pages, 3)
  assert.equal(p1.body.total, 25)
  assert.equal(p1.body.complaints[0].description, 'complaint 24')

  const p3 = await get({ limit: 10, page: 3 })
  assert.equal(p3.body.page, 3)
  assert.equal(p3.body.complaints.length, 5)
  assert.equal(p3.body.complaints[4].description, 'complaint 0')

  const beyond = await get({ limit: 10, page: 4 })
  assert.equal(beyond.status, 200)
  assert.equal(beyond.body.complaints.length, 0)
  assert.equal(beyond.body.pages, 3)

  for (const page of ['abc', '0', '-2']) {
    const res = await get({ limit: 10, page })
    assert.equal(res.body.page, 1, page)
    assert.equal(res.body.complaints[0].description, 'complaint 24')
  }
})

test('warden list clamps the page size', async () => {
  await seedComplaints(Array.from({ length: 3 }, () => ({})))
  const w = await createWarden()
  const get = (query) => request(app).get('/api/complaints').query(query).set(auth(w.token))

  assert.equal((await get({ limit: 500 })).body.limit, 100)
  const tiny = await get({ limit: 0 })
  assert.equal(tiny.body.limit, 1)
  assert.equal(tiny.body.complaints.length, 1)
  assert.equal(tiny.body.pages, 3)
  assert.equal((await get({ limit: 'lots' })).body.limit, 20)
  assert.equal((await get({ page: '99999999999999999999' })).status, 200)
})

test('warden list with no complaints reports one empty page', async () => {
  const w = await createWarden()
  const res = await request(app).get('/api/complaints').set(auth(w.token))
  assert.deepEqual(res.body, { complaints: [], page: 1, limit: 20, total: 0, pages: 1, counts: { total: 0, open: 0, completed: 0 } })
})

// --- deploy config ---

test('vercel.json forces the Other preset and keeps the rewrite', () => {
  const config = require('../vercel.json')
  assert.equal(config.framework, null)
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json')
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/api' }])
})

test('a student with a temporary password must change it before using complaints', async () => {
  await registerStudent()
  const w = await createWarden()
  const reset = await request(app).post('/api/auth/reset-password')
    .set('Authorization', `Bearer ${w.token}`).send({ email: 'student@example.com' })
  assert.equal(reset.status, 200)

  const login = await request(app).post('/api/auth/login')
    .send({ email: 'student@example.com', password: reset.body.temporaryPassword })
  const auth = { Authorization: `Bearer ${login.body.token}` }

  const blockedCreate = await request(app).post('/api/complaints').set(auth).send(complaint)
  assert.equal(blockedCreate.status, 403)
  assert.equal(blockedCreate.body.message, 'Please change your password first')
  const blockedList = await request(app).get('/api/complaints/mine').set(auth)
  assert.equal(blockedList.status, 403)

  // /me and change-password stay available so the user can fix it
  const me = await request(app).get('/api/auth/me').set(auth)
  assert.equal(me.status, 200)
  const changed = await request(app).post('/api/auth/change-password').set(auth)
    .send({ currentPassword: reset.body.temporaryPassword, newPassword: 'brand-new-pw' })
  assert.equal(changed.status, 200)

  const ok = await request(app).post('/api/complaints')
    .set('Authorization', `Bearer ${changed.body.token}`).send(complaint)
  assert.equal(ok.status, 201)
})

test('without VERCEL, X-Forwarded-For is ignored so it cannot dodge the login limit', async () => {
  const wrong = { email: 'student@example.com', password: 'wrong-password' }
  let blocked = 0
  for (let i = 0; i < 15; i++) {
    const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', `10.0.${i}.1`).send(wrong)
    if (res.status === 429) blocked++
  }
  assert.equal(blocked, 5)
})
