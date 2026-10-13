// M3: when MongoDB is unreachable, API calls fail fast with a clear 503
// instead of a generic 500. Runs in its own process with no database.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')

test('M3: API returns 503 with Retry-After when the database is unreachable', async () => {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:1/unreachable'
  process.env.JWT_SECRET = 'test-secret'
  process.env.LOG_LEVEL = 'silent'
  const app = require('../app')

  const started = Date.now()
  const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'whatever-1' })
  const seconds = (Date.now() - started) / 1000

  assert.equal(res.status, 503)
  assert.equal(res.body.message, 'The service is temporarily unavailable. Please try again shortly.')
  assert.ok(Number(res.headers['retry-after']) > 0)
  assert.ok(seconds < 8, `took ${seconds}s`)

  await require('mongoose').disconnect()
})
