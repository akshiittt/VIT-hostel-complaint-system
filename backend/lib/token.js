const jwt = require('jsonwebtoken')

// The only place login tokens are created. `v` is the user's tokenVersion;
// protect rejects tokens whose v no longer matches, so bumping tokenVersion
// (password change or reset) logs out every existing session.
function generateToken(user) {
  return jwt.sign(
    { id: String(user._id), v: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' }
  )
}

module.exports = { generateToken }
