const crypto = require('crypto')

// No 0/O/o, 1/l/I: the warden reads this out or writes it down for the student
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const LENGTH = 12
// Largest multiple of the alphabet size that fits in a byte. Bytes at or above
// it are skipped so every character is equally likely (no modulo bias).
const CUTOFF = 256 - (256 % ALPHABET.length)

function generateTemporaryPassword() {
  let password = ''
  while (password.length < LENGTH) {
    for (const byte of crypto.randomBytes(LENGTH * 2)) {
      if (byte >= CUTOFF) continue
      password += ALPHABET[byte % ALPHABET.length]
      if (password.length === LENGTH) break
    }
  }
  return password
}

module.exports = { generateTemporaryPassword, ALPHABET }
