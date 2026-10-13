const jwt = require('jsonwebtoken')
const User = require('../models/User')

const protect = async (req, res, next) => {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' })
  }

  let decoded
  try {
    decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(401).json({ message: 'Not authorized, token failed' })
  }

  const user = await User.findById(decoded.id)
  if (!user) {
    return res.status(401).json({ message: 'Not authorized, user no longer exists' })
  }

  req.user = user
  next()
}

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: insufficient permissions' })
  }
  next()
}

module.exports = { protect, allowRoles }
