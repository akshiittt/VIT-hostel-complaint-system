const isBlank = (value) => typeof value !== 'string' || value.trim() === ''

// Returns the 400 message for the first field over its limit, or null.
// fields: [[label, value, max, { bytes }]]. Trimmed length is used because the
// schemas trim; `bytes` measures UTF-8 bytes (bcrypt ignores bytes past 72).
function tooLongMessage(fields) {
  for (const [label, value, max, options = {}] of fields) {
    if (typeof value !== 'string') continue
    const length = options.bytes ? Buffer.byteLength(value, 'utf8') : value.trim().length
    if (length > max) return `${label} is too long (max ${max} characters)`
  }
  return null
}

module.exports = { isBlank, tooLongMessage }
