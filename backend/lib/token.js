const jwt = require('jsonwebtoken')

// The only place login tokens are created. `v` is the user's tokenVersion;
// protect rejects tokens whose v no longer matches, so bumping tokenVersion
// (password change, reset or logout) ends every existing session.
// One day keeps a token stolen from a shared hostel PC short-lived.
function generateToken(user) {
  return jwt.sign(
    { id: String(user._id), v: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1d' }
  )
}

module.exports = { generateToken }
