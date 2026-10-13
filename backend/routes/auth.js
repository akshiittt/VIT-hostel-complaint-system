const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { protect } = require('../middleware/auth')
const { isValidBlock, LIMITS, RATE_LIMITS } = require('../lib/constants')
const { isBlank, tooLongMessage } = require('../lib/validation')
const rateLimit = require('../lib/rateLimit')

const router = express.Router()

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' })

const loginPerIpEmail = rateLimit(RATE_LIMITS.loginPerIpEmail)
const loginPerIp = rateLimit(RATE_LIMITS.loginPerIp)
const registerPerIp = rateLimit(RATE_LIMITS.registerPerIp)

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
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' })
  }
  if (!isValidBlock(hostelType, block)) {
    return res.status(400).json({ message: 'Please choose a valid hostel and block' })
  }

  // Fast path for the common case. Two simultaneous sign-ups can both pass
  // this check; the unique index then rejects one and app.js turns it into 409.
  const exists = await User.exists({ email: normalizedEmail })
  if (exists) {
    return res.status(409).json({ message: 'An account with this email already exists' })
  }

  // Role is always student here; warden accounts are only created by seed.js
  const user = await User.create({ name, email: normalizedEmail, password, role: 'student', regNumber, hostelType, block, room })

  res.status(201).json({ token: generateToken(user._id), user: user.toPublic() })
})

router.post('/login', loginPerIpEmail, loginPerIp, async (req, res) => {
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
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  res.json({ token: generateToken(user._id), user: user.toPublic() })
})

router.get('/me', protect, (req, res) => {
  res.json(req.user.toPublic())
})

module.exports = router
