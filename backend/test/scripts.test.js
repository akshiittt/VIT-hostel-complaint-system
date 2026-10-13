// Runs seed.js, scripts/db-indexes.js and server.js as real child processes
// against an in-memory MongoDB and checks their output and exit codes.
//
// Safety: every script calls dotenv, which reads .env from the current
// directory. The children run in an empty temp directory, and every variable
// they read is passed explicitly (empty when unused; dotenv never overrides an
// existing variable), so backend/.env and its real MONGO_URI are never used.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const BACKEND = path.resolve(__dirname, '..')
const SCRIPT_ENV_KEYS = ['MONGO_URI', 'JWT_SECRET', 'ALLOWED_ORIGINS', 'ALLOWED_EMAIL_DOMAINS', 'PORT', 'SEED_WARDEN_NAME', 'SEED_WARDEN_EMAIL', 'SEED_WARDEN_PASSWORD', 'DNS_SERVERS', 'VERCEL']

let mongod
let emptyDir
let dbCounter = 0

before(async () => {
  mongod = await MongoMemoryServer.create()
  emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vit-hostel-scripts-'))
})

after(async () => {
  await mongod.stop()
  fs.rmSync(emptyDir, { recursive: true, force: true })
})

// A fresh database name per test on the shared memory server
function freshUri() {
  return mongod.getUri(`scripts_${process.pid}_${++dbCounter}`)
}

// Every app variable is set (empty unless given) so dotenv can't fill it in
function childEnv(vars) {
  const env = { ...process.env, LOG_LEVEL: 'silent', BCRYPT_ROUNDS: '4' }
  for (const key of SCRIPT_ENV_KEYS) env[key] = ''
  return { ...env, ...vars }
}

function run(script, vars, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(BACKEND, script)], { cwd: emptyDir, env: childEnv(vars) })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${script} timed out\nstdout: ${stdout}\nstderr: ${stderr}`))
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

// Opens a separate connection to inspect the database a script wrote to
async function withDb(uri, fn) {
  const conn = await mongoose.createConnection(uri).asPromise()
  try {
    return await fn(conn.db)
  } finally {
    await conn.close()
  }
}

test('backend/.env is never visible to the children', () => {
  assert.equal(fs.readdirSync(emptyDir).length, 0)
  assert.equal(childEnv({}).MONGO_URI, '')
})

test('seed creates the warden with the password hashed exactly once', async () => {
  const uri = freshUri()
  const res = await run('seed.js', {
    MONGO_URI: uri,
    SEED_WARDEN_NAME: 'Warden Test',
    SEED_WARDEN_EMAIL: '  Warden@Example.COM ',
    SEED_WARDEN_PASSWORD: 'a-long-warden-pass'
  })

  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /Warden account created: warden@example\.com/)
  await withDb(uri, async (db) => {
    const users = await db.collection('users').find().toArray()
    assert.equal(users.length, 1)
    assert.equal(users[0].role, 'warden')
    assert.equal(users[0].name, 'Warden Test')
    assert.equal(await bcrypt.compare('a-long-warden-pass', users[0].password), true, 'a double hash would fail here')
  })
})

test('seed on localhost without a password uses the demo password and warns', async () => {
  const uri = freshUri()
  const res = await run('seed.js', { MONGO_URI: uri })

  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stderr, /Using the demo password because MONGO_URI is local/)
  assert.match(res.stdout, /Warden account created: warden@vithostel\.com/)
})

test('seed run again updates the existing warden instead of duplicating it', async () => {
  const uri = freshUri()
  assert.equal((await run('seed.js', { MONGO_URI: uri, SEED_WARDEN_PASSWORD: 'first-long-password' })).code, 0)

  const res = await run('seed.js', { MONGO_URI: uri, SEED_WARDEN_NAME: 'Renamed', SEED_WARDEN_PASSWORD: 'second-long-password' })

  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /Warden account updated: warden@vithostel\.com/)
  await withDb(uri, async (db) => {
    const users = await db.collection('users').find().toArray()
    assert.equal(users.length, 1)
    assert.equal(users[0].name, 'Renamed')
    assert.equal(await bcrypt.compare('second-long-password', users[0].password), true)
  })
})

test('seed aborts on a remote URI without a password, before connecting', async () => {
  // .invalid never resolves; reaching it would print "Seed error: ..." instead
  const started = Date.now()
  const res = await run('seed.js', { MONGO_URI: 'mongodb+srv://user:pw@cluster0.example.invalid/vithostel' })

  assert.equal(res.code, 1)
  assert.equal(res.stderr.trim(), 'Seed aborted: SEED_WARDEN_PASSWORD is required (at least 12 characters) when MONGO_URI is not localhost.')
  assert.doesNotMatch(res.stderr, /Seed error/)
  assert.equal(res.stdout, '')
  assert.ok(Date.now() - started < 10000)
})

test('seed refuses to touch an existing student with the warden email', async () => {
  const uri = freshUri()
  await withDb(uri, (db) => db.collection('users').insertOne({
    name: 'A Student', email: 'warden@vithostel.com', password: 'student-hash', role: 'student', regNumber: '23BCE1234', tokenVersion: 0
  }))

  const res = await run('seed.js', { MONGO_URI: uri, SEED_WARDEN_PASSWORD: 'a-long-warden-pass' })

  assert.equal(res.code, 1)
  assert.match(res.stderr, /Seed aborted: An account with this email already exists and is not a warden \(warden@vithostel\.com\)\. No changes made\./)
  await withDb(uri, async (db) => {
    const users = await db.collection('users').find().toArray()
    assert.equal(users.length, 1)
    assert.equal(users[0].role, 'student')
    assert.equal(users[0].password, 'student-hash')
  })
})

test('db-indexes creates every index, reports success and keeps a manual extra index', async () => {
  const uri = freshUri()
  await withDb(uri, (db) => db.collection('users').createIndex({ name: 1 }, { name: 'manual_name_1' }))

  const res = await run('scripts/db-indexes.js', { MONGO_URI: uri })

  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /All indexes are in place\./)
  assert.match(res.stdout, /^User: .*manual_name_1/m)
  await withDb(uri, async (db) => {
    const userIndexes = (await db.collection('users').indexes()).map((i) => i.name)
    assert.ok(userIndexes.includes('manual_name_1'), 'never drops an index outside the schema')
    assert.ok(userIndexes.includes('email_1'))
    assert.ok(userIndexes.includes('regNumber_1'))
    const complaintIndexes = (await db.collection('complaints').indexes()).map((i) => i.name)
    assert.ok(complaintIndexes.includes('status_1_urgent_-1_createdAt_-1'))
    const rateIndexes = await db.collection('ratelimits').indexes()
    assert.ok(rateIndexes.some((i) => i.name === 'expiresAt_1' && i.expireAfterSeconds === 0))
  })
})

test('db-indexes exits 1 and explains when duplicates block a unique index, without changing data', async () => {
  const uri = freshUri()
  await withDb(uri, (db) => db.collection('users').insertMany([
    { name: 'One', email: 'same@example.com', password: 'x', role: 'warden', regNumber: '' },
    { name: 'Two', email: 'same@example.com', password: 'y', role: 'warden', regNumber: '' }
  ]))

  const res = await run('scripts/db-indexes.js', { MONGO_URI: uri })

  assert.equal(res.code, 1)
  assert.match(res.stderr, /Some indexes could not be built \(no data was changed\)/)
  assert.match(res.stderr, /User: /)
  assert.doesNotMatch(res.stdout, /All indexes are in place/)
  await withDb(uri, async (db) => assert.equal(await db.collection('users').countDocuments(), 2))
})

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

test('server.js boots, connects and answers /api/health', async () => {
  const port = await freePort()
  const child = spawn(process.execPath, [path.join(BACKEND, 'server.js')], {
    cwd: emptyDir,
    env: childEnv({ MONGO_URI: freshUri(), JWT_SECRET: 'test-secret', PORT: String(port) })
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => { stdout += d })
  child.stderr.on('data', (d) => { stderr += d })
  const exited = new Promise((resolve) => child.on('exit', resolve))

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start\nstdout: ${stdout}\nstderr: ${stderr}`)), 30000)
      const check = () => {
        if (stdout.includes(`Server running on http://localhost:${port}`) && stdout.includes('MongoDB connected')) {
          clearTimeout(timer)
          resolve()
        }
      }
      child.stdout.on('data', check)
      child.on('exit', (code) => reject(new Error(`server exited early with ${code}: ${stderr}`)))
    })

    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: 'ok', db: 'ok' })
  } finally {
    child.kill()
    await exited
  }
})

test('server.js exits 1 with a clear message when JWT_SECRET is missing', async () => {
  const res = await run('server.js', { MONGO_URI: freshUri(), PORT: String(await freePort()) }, { timeoutMs: 15000 })

  assert.equal(res.code, 1)
  assert.match(res.stderr, /JWT_SECRET is not set\. Copy \.env\.example to \.env and fill it in\./)
  assert.doesNotMatch(res.stdout, /Server running/)
})
