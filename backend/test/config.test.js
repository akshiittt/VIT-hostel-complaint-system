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
