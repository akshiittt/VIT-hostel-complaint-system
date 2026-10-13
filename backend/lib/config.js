const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET']

// Names of required env vars that are unset or empty. Reads process.env on
// every call (not at import time) so tests and late-loaded env both work.
function missingConfig() {
  return REQUIRED_ENV.filter((name) => !process.env[name] || !process.env[name].trim())
}

// Browsers send Origin as scheme://host[:port] in lower case with no trailing
// slash. Normalise the configured list the same way so a value pasted from the
// Vercel dashboard (often with a trailing '/') still matches.
function normalizeOrigin(origin) {
  return origin.trim().replace(/\/+$/, '').toLowerCase()
}

function parseAllowedOrigins(value) {
  const origins = (value || '').split(',').map(normalizeOrigin).filter(Boolean)
  return origins.length ? origins : ['http://localhost:5173']
}

module.exports = { missingConfig, parseAllowedOrigins, REQUIRED_ENV }
