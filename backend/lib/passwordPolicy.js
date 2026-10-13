const bcrypt = require('bcryptjs')
const { LIMITS } = require('./constants')

const MIN_PASSWORD_LENGTH = 8

// The most guessed passwords that pass the length rule, plus obvious
// campus-specific ones. Compared case-insensitively.
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd',
  'qwerty12', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'zaq12wsx', 'iloveyou',
  'abc12345', 'abcd1234', 'admin123', 'welcome1', 'welcome123', 'letmein1',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'trustno1',
  'vitstudent', 'vit12345', 'vitvellore', 'hostel123', 'warden123', 'student1',
  'student123', 'changeme'
])

// Returns the 400 message for a new password that breaks the policy, or null.
function passwordProblem(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (Buffer.byteLength(password, 'utf8') > LIMITS.password) {
    return `Password is too long (max ${LIMITS.password} characters)`
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'This password is too common. Please choose another.'
  }
  return null
}

const DEFAULT_BCRYPT_ROUNDS = 12

// bcrypt work factor. Always 12 in production; the test suites set
// BCRYPT_ROUNDS=4 to stay fast. Values outside 4–15 are ignored.
function bcryptRounds() {
  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS, 10)
  return Number.isInteger(rounds) && rounds >= 4 && rounds <= 15 ? rounds : DEFAULT_BCRYPT_ROUNDS
}

// The single place passwords are hashed: used by the User pre-save hook and by
// routes that update the password atomically together with tokenVersion.
function hashPassword(password) {
  return bcrypt.hash(password, bcryptRounds())
}

module.exports = { passwordProblem, bcryptRounds, hashPassword, MIN_PASSWORD_LENGTH, COMMON_PASSWORDS }
