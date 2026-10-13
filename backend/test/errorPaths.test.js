// Error branches that the main API tests don't reach: database errors in the
// middle of a request, the health-check timeout, a missing MONGO_URI, the rate
// limiter's duplicate-key retry and two auth validation messages.
const { test, before, after, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const request = require('supertest')

let mongod
let app
let User
let RateLimit
let connectDB

before(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.JWT_SECRET = 'test-secret'
  process.env.LOG_LEVEL = 'silent'
  process.env.BCRYPT_ROUNDS = '4'
  delete process.env.MONGO_URI
  delete process.env.VERCEL
  app = require('../app')
  User = require('../models/User')
  RateLimit = require('../models/RateLimit')
  connectDB = require('../lib/db')
})

after(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

afterEach(() => {
  mock.restoreAll()
})

// Keeps expected console.error output (logged 500s, health failures) out of the test report
function silenceConsoleError() {
  return mock.method(console, 'error', () => {})
}

async function freshDb() {
  process.env.MONGO_URI = mongod.getUri()
  await connectDB()
  await mongoose.connection.db.dropDatabase()
  await User.syncIndexes()
  await RateLimit.syncIndexes()
}

function errorNamed(name, message = 'simulated') {
  const error = new Error(message)
  error.name = name
  return error
}

// Runs first, before anything has connected
test('db.js: connecting without MONGO_URI fails with a clear message', async () => {
  delete process.env.MONGO_URI
  assert.notEqual(mongoose.connection.readyState, 1)
  await assert.rejects(connectDB(), { message: 'MONGO_URI is not set' })
})

for (const name of ['MongoNetworkError', 'MongoServerSelectionError', 'MongoNotConnectedError', 'MongoNetworkTimeoutError']) {
  test(`a ${name} in the middle of a request becomes 503 with Retry-After`, async () => {
    await freshDb()
    mock.method(User, 'findOne', () => { throw errorNamed(name) })

    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'whatever-1' })

    assert.equal(res.status, 503)
    assert.equal(res.body.message, 'The service is temporarily unavailable. Please try again shortly.')
    assert.equal(res.headers['retry-after'], '30')
  })
}

test('a Mongoose "buffering timed out" error mid-request becomes 503', async () => {
  await freshDb()
  mock.method(User, 'findOne', () => { throw new Error('Operation `users.findOne()` buffering timed out after 10000ms') })

  const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'whatever-1' })

  assert.equal(res.status, 503)
  assert.ok(res.headers['retry-after'])
})

test('an unexpected error becomes a generic 500 that never leaks the real message', async () => {
  await freshDb()
  const consoleError = silenceConsoleError()
  mock.method(User, 'findOne', () => { throw new Error('secret internal detail') })

  const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'whatever-1' })

  assert.equal(res.status, 500)
  assert.deepEqual(res.body, { message: 'Something went wrong on the server' })
  assert.doesNotMatch(res.text, /secret internal detail/)
  assert.equal(consoleError.mock.callCount(), 1, 'the real error is logged on the server')
})

test('health check gives up after 5 s when the database ping hangs', async () => {
  await freshDb()
  silenceConsoleError()
  mock.method(mongoose.connection.db, 'admin', () => ({ ping: () => new Promise(() => {}) }))

  const started = Date.now()
  const res = await request(app).get('/api/health')
  const ms = Date.now() - started

  assert.equal(res.status, 503)
  assert.deepEqual(res.body, { status: 'error', db: 'unreachable' })
  assert.ok(ms >= 4900 && ms < 9000, `took ${ms}ms`)
})

test('rate limiter: a duplicate-key race on a new window is retried and still counted', async () => {
  await freshDb()
  const rateLimit = require('../lib/rateLimit')
  const limiter = rateLimit({ name: 'race-test', windowMs: 60 * 1000, max: 1, keyFn: () => 'client' })
  const original = RateLimit.findOneAndUpdate
  let calls = 0
  mock.method(RateLimit, 'findOneAndUpdate', function (...args) {
    calls++
    // The first upsert loses the race: another request inserted the same key
    if (calls === 1) {
      return { lean: () => Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 })) }
    }
    return original.apply(this, args)
  })

  let nextCalls = 0
  const res = { set() {}, status() { return this }, json() { return this } }
  await limiter({}, res, () => { nextCalls++ })

  assert.equal(calls, 2, 'retried once')
  assert.equal(nextCalls, 1, 'the request is let through')
  const [entry] = await RateLimit.find({ key: /^race-test:client:/ }).lean()
  assert.equal(entry.count, 1)
})

test('rate limiter: other database errors are not swallowed', async () => {
  await freshDb()
  const rateLimit = require('../lib/rateLimit')
  const limiter = rateLimit({ name: 'error-test', windowMs: 60 * 1000, max: 1, keyFn: () => 'client' })
  mock.method(RateLimit, 'findOneAndUpdate', () => ({ lean: () => Promise.reject(errorNamed('MongoNetworkError')) }))

  await assert.rejects(limiter({}, {}, () => assert.fail('must not call next')), { name: 'MongoNetworkError' })
})

test('register rejects a malformed email after trimming', async () => {
  await freshDb()
  const res = await request(app).post('/api/auth/register').send({
    name: 'Test', email: '  not-an-email  ', password: 'secret123', regNumber: '23BCE1234',
    hostelType: "Men's Hostel", block: 'A', room: '1'
  })

  assert.equal(res.status, 400)
  assert.equal(res.body.message, 'Please enter a valid email address')
  assert.equal(await User.countDocuments(), 0)
})

test('login rejects a blank or non-string email/password with 400', async () => {
  await freshDb()
  for (const body of [{}, { email: '', password: 'x' }, { email: 'a@b.co', password: '   ' }, { email: { $ne: null }, password: 'x' }]) {
    const res = await request(app).post('/api/auth/login').send(body)
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.equal(res.body.message, 'Please enter email and password')
  }
})
