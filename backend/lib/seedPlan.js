// Pure decision logic for seed.js, kept separate so it can be unit tested
// without a database.
const { LIMITS } = require('./constants')

const DEMO_PASSWORD = 'warden1234'
const MIN_PASSWORD_LENGTH = 8

// Only a plain mongodb:// URI pointing at this machine counts as local.
// mongodb+srv always resolves to a remote cluster.
function isLocalMongoUri(uri) {
  try {
    const url = new URL(uri)
    return url.protocol === 'mongodb:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

// Decides which password to use, without touching the DB.
// Returns { password, warning } or { error }.
function resolvePassword(env) {
  const password = env.SEED_WARDEN_PASSWORD
  if (!password) {
    if (isLocalMongoUri(env.MONGO_URI)) {
      return {
        password: DEMO_PASSWORD,
        warning: 'Using the demo password because MONGO_URI is local. Set SEED_WARDEN_PASSWORD before seeding a shared database.'
      }
    }
    return { error: `SEED_WARDEN_PASSWORD is required (at least ${MIN_PASSWORD_LENGTH} characters) when MONGO_URI is not localhost.` }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `SEED_WARDEN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (Buffer.byteLength(password, 'utf8') > LIMITS.password) {
    return { error: `SEED_WARDEN_PASSWORD must be at most ${LIMITS.password} characters.` }
  }
  return { password }
}

// passwordResult: the return value of resolvePassword(env), computed once by seed.js.
// existingUser: the user already stored with the warden email, or null/undefined.
// Returns { action: 'create' | 'update' | 'abort', reason, password, warning }.
function planSeed({ passwordResult, existingUser }) {
  const { password, warning, error } = passwordResult
  if (error) return { action: 'abort', reason: error }

  if (existingUser && existingUser.role !== 'warden') {
    return { action: 'abort', reason: 'An account with this email already exists and is not a warden' }
  }
  if (existingUser) {
    return { action: 'update', reason: 'Warden account exists; updating name and password', password, warning }
  }
  return { action: 'create', reason: 'No account with this email; creating a warden', password, warning }
}

module.exports = { planSeed, resolvePassword, isLocalMongoUri, DEMO_PASSWORD, MIN_PASSWORD_LENGTH }
