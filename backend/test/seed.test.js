const { test } = require('node:test')
const assert = require('node:assert/strict')
const { planSeed: planFromResult, resolvePassword, isLocalMongoUri, DEMO_PASSWORD } = require('../lib/seedPlan')

// seed.js resolves the password once, then hands the result to planSeed
const planSeed = ({ env, existingUser }) => planFromResult({ passwordResult: resolvePassword(env), existingUser })

const remote = 'mongodb+srv://user:pw@cluster0.example.mongodb.net/vithostel'
const local = 'mongodb://localhost:27017/vithostel'

test('seed: missing password on a remote URI aborts', () => {
  const plan = planSeed({ env: { MONGO_URI: remote } })
  assert.equal(plan.action, 'abort')
  assert.match(plan.reason, /SEED_WARDEN_PASSWORD/)
})

test('seed: short password aborts, even on localhost', () => {
  assert.equal(planSeed({ env: { MONGO_URI: remote, SEED_WARDEN_PASSWORD: 'short' } }).action, 'abort')
  assert.equal(planSeed({ env: { MONGO_URI: local, SEED_WARDEN_PASSWORD: 'short' } }).action, 'abort')
})

test('seed: localhost without a password creates with the demo password and a warning', () => {
  const plan = planSeed({ env: { MONGO_URI: local } })
  assert.equal(plan.action, 'create')
  assert.equal(plan.password, DEMO_PASSWORD)
  assert.ok(plan.warning)
})

test('seed: a strong password on a remote URI creates', () => {
  const plan = planSeed({ env: { MONGO_URI: remote, SEED_WARDEN_PASSWORD: 'a-long-password' } })
  assert.equal(plan.action, 'create')
  assert.equal(plan.password, 'a-long-password')
})

test('seed: an existing student with the same email aborts', () => {
  const plan = planSeed({ env: { MONGO_URI: local }, existingUser: { role: 'student' } })
  assert.equal(plan.action, 'abort')
  assert.equal(plan.reason, 'An account with this email already exists and is not a warden')
})

test('seed: an existing warden is updated', () => {
  const plan = planSeed({
    env: { MONGO_URI: remote, SEED_WARDEN_PASSWORD: 'a-long-password' },
    existingUser: { role: 'warden' }
  })
  assert.equal(plan.action, 'update')
  assert.equal(plan.password, 'a-long-password')
})

test('seed: only mongodb:// on localhost or 127.0.0.1 counts as local', () => {
  assert.equal(isLocalMongoUri('mongodb://localhost:27017/x'), true)
  assert.equal(isLocalMongoUri('mongodb://127.0.0.1/x'), true)
  assert.equal(isLocalMongoUri('mongodb+srv://localhost/x'), false)
  assert.equal(isLocalMongoUri(remote), false)
  assert.equal(isLocalMongoUri('not a uri'), false)
  assert.equal(isLocalMongoUri(undefined), false)
})

test('seed: the warden password needs at least 12 characters', () => {
  assert.equal(planSeed({ env: { MONGO_URI: remote, SEED_WARDEN_PASSWORD: 'elevenchars' } }).action, 'abort')
  assert.equal(planSeed({ env: { MONGO_URI: remote, SEED_WARDEN_PASSWORD: 'twelve-chars' } }).action, 'create')
})
