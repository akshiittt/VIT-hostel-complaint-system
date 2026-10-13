const express = require('express')
const User = require('../models/User')
const { protect, allowRoles } = require('../middleware/auth')
const { isValidBlock, LIMITS, REG_NUMBER_PATTERN, RATE_LIMITS } = require('../lib/constants')
const { passwordProblem } = require('../lib/passwordPolicy')
const { log } = require('../lib/logger')
const { allowedEmailDomains } = require('../lib/config')
const { isBlank, tooLongMessage } = require('../lib/validation')
const { generateToken } = require('../lib/token')
const { generateTemporaryPassword } = require('../lib/tempPassword')
const rateLimit = require('../lib/rateLimit')

const router = express.Router()

const loginPerIpEmail = rateLimit(RATE_LIMITS.loginPerIpEmail)
const loginPerEmail = rateLimit(RATE_LIMITS.loginPerEmail)
const loginPerIp = rateLimit(RATE_LIMITS.loginPerIp)
const registerPerIp = rateLimit(RATE_LIMITS.registerPerIp)
const changePasswordPerUser = rateLimit(RATE_LIMITS.changePasswordPerUser)
const resetPerWarden = rateLimit(RATE_LIMITS.resetPerWarden)

// Bumps tokenVersion with $inc (safe against two concurrent changes) and
// returns the updated user, whose token carries the new version
function bumpTokenVersion(userId) {
  return User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }, { new: true })
}

router.post('/register', registerPerIp, async (req, res) => {
  const { name, email, password, regNumber, hostelType, block, room } = req.body || {}

  if ([name, email, password, regNumber, hostelType, block, room].some(isBlank)) {
    return res.status(400).json({ message: 'Please fill in all required fields' })
  }
  const tooLong = tooLongMessage([
    ['Name', name, LIMITS.name],
    ['Email', email, LIMITS.email],
    ['Password', password, LIMITS.password, { bytes: true }],
    ['Registration number', regNumber, LIMITS.regNumber],
    ['Room', room, LIMITS.room]
  ])
  if (tooLong) {
    return res.status(400).json({ message: tooLong })
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address' })
  }
  const domains = allowedEmailDomains()
  if (domains.length && !domains.includes(normalizedEmail.slice(normalizedEmail.lastIndexOf('@') + 1))) {
    return res.status(400).json({ message: `Please use your university email (@${domains.join(' or @')})` })
  }
  const normalizedReg = regNumber.trim().toUpperCase()
  if (!REG_NUMBER_PATTERN.test(normalizedReg)) {
    return res.status(400).json({ message: 'Please enter a valid registration number (e.g. 23BCE1234)' })
  }
  const weakPassword = passwordProblem(password)
  if (weakPassword) {
    return res.status(400).json({ message: weakPassword })
  }
  if (!isValidBlock(hostelType, block)) {
    return res.status(400).json({ message: 'Please choose a valid hostel and block' })
  }

  // Fast path for the common case. Two simultaneous sign-ups can both pass
  // these checks; the unique indexes then reject one and app.js turns it into 409.
  const exists = await User.exists({ email: normalizedEmail })
  if (exists) {
    return res.status(409).json({ message: 'An account with this email already exists' })
  }
  // Same normalisation as the schema (trim + uppercase)
  const regTaken = await User.exists({ role: 'student', regNumber: normalizedReg })
  if (regTaken) {
    return res.status(409).json({ message: 'This registration number is already registered' })
  }

  // Role is always student here; warden accounts are only created by seed.js
  const user = await User.create({ name, email: normalizedEmail, password, role: 'student', regNumber, hostelType, block, room })

  res.status(201).json({ token: generateToken(user), user: user.toPublic() })
})

router.post('/login', loginPerIpEmail, loginPerEmail, loginPerIp, async (req, res) => {
  const { email, password } = req.body || {}

  if (isBlank(email) || isBlank(password)) {
    return res.status(400).json({ message: 'Please enter email and password' })
  }
  const tooLong = tooLongMessage([
    ['Email', email, LIMITS.email],
    ['Password', password, LIMITS.password, { bytes: true }]
  ])
  if (tooLong) {
    return res.status(400).json({ message: tooLong })
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password')
  if (!user || !(await user.matchPassword(password))) {
    // Who was targeted (if the account exists) and from where; never the email or password
    log('login_failed', { userId: user ? String(user._id) : undefined, ip: req.ip })
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  log('login', { userId: String(user._id), role: user.role })
  res.json({ token: generateToken(user), user: user.toPublic() })
})

router.get('/me', protect, (req, res) => {
  res.json(req.user.toPublic())
})

// Any logged-in user changes their own password. A wrong current password is
// 400, not 401, so the frontend doesn't treat it as an expired session.
router.post('/change-password', protect, changePasswordPerUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}

  if (isBlank(currentPassword) || isBlank(newPassword)) {
    return res.status(400).json({ message: 'Please fill in all required fields' })
  }
  const weakPassword = passwordProblem(newPassword)
  if (weakPassword) {
    return res.status(400).json({ message: weakPassword })
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: 'New password must be different from the current one' })
  }

  const user = await User.findById(req.user._id).select('+password')
  if (!user || !(await user.matchPassword(currentPassword))) {
    return res.status(400).json({ message: 'Current password is incorrect' })
  }

  // Plain password on purpose: the pre-save hook hashes it exactly once.
  // Bumping tokenVersion logs out every other session.
  user.password = newPassword
  user.mustChangePassword = false
  await user.save({ validateModifiedOnly: true })
  const updated = await bumpTokenVersion(user._id)

  log('password_changed', { userId: String(user._id) })
  res.json({ token: generateToken(updated), user: updated.toPublic() })
})

// A warden gives a student who forgot their password a temporary one. The
// student must change it after logging in. Wardens can't reset other wardens.
router.post('/reset-password', protect, allowRoles('warden'), resetPerWarden, async (req, res) => {
  const { email } = req.body || {}

  if (isBlank(email)) {
    return res.status(400).json({ message: "Please enter the student's email" })
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() })
  if (!user || user.role !== 'student') {
    return res.status(404).json({ message: 'No student account with that email' })
  }

  // Never log this value
  const temporaryPassword = generateTemporaryPassword()
  user.password = temporaryPassword
  user.mustChangePassword = true
  user.passwordResetAt = new Date()
  user.passwordResetBy = req.user._id
  await user.save({ validateModifiedOnly: true })
  await bumpTokenVersion(user._id)

  log('password_reset', { studentId: String(user._id), wardenId: String(req.user._id) })
  res.json({ email: user.email, temporaryPassword })
})

module.exports = router
