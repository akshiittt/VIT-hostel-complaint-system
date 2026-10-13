const { test } = require('node:test')
const assert = require('node:assert/strict')
const { generateTemporaryPassword } = require('../lib/tempPassword')

test('temporary passwords are 12 unambiguous characters and differ each time', () => {
  const seen = new Set()
  for (let i = 0; i < 200; i++) {
    const password = generateTemporaryPassword()
    assert.equal(password.length, 12)
    assert.match(password, /^[A-Za-z2-9]{12}$/)
    assert.doesNotMatch(password, /[0O1lI]/)
    seen.add(password)
  }
  assert.equal(seen.size, 200)
})
