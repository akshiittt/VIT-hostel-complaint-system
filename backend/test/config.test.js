const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseAllowedOrigins } = require('../lib/config')

test('allowed origins tolerate trailing slashes, spaces and letter case', () => {
  const origins = parseAllowedOrigins(' https://VIT-Hostel.vercel.app/ , http://localhost:5173 ,,')
  assert.deepEqual(origins, ['https://vit-hostel.vercel.app', 'http://localhost:5173'])
})

test('allowed origins default to the local dev server', () => {
  assert.deepEqual(parseAllowedOrigins(undefined), ['http://localhost:5173'])
  assert.deepEqual(parseAllowedOrigins(''), ['http://localhost:5173'])
})

test('allowed email domains are parsed per call, trimmed and lower-cased', () => {
  const { allowedEmailDomains } = require('../lib/config')
  const saved = process.env.ALLOWED_EMAIL_DOMAINS
  try {
    process.env.ALLOWED_EMAIL_DOMAINS = ' VITStudent.ac.in , vit.ac.in ,,'
    assert.deepEqual(allowedEmailDomains(), ['vitstudent.ac.in', 'vit.ac.in'])
    process.env.ALLOWED_EMAIL_DOMAINS = ''
    assert.deepEqual(allowedEmailDomains(), [])
    delete process.env.ALLOWED_EMAIL_DOMAINS
    assert.deepEqual(allowedEmailDomains(), [])
  } finally {
    if (saved === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS
    else process.env.ALLOWED_EMAIL_DOMAINS = saved
  }
})
