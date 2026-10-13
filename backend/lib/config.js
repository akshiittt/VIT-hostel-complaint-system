const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET']

// Names of required env vars that are unset or empty. Reads process.env on
// every call (not at import time) so tests and late-loaded env both work.
function missingConfig() {
  return REQUIRED_ENV.filter((name) => !process.env[name] || !process.env[name].trim())
}

module.exports = { missingConfig, REQUIRED_ENV }
