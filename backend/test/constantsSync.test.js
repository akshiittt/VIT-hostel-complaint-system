const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const backend = require('../lib/constants')

// vit-hostel/src/constants.js mirrors these lists; a mismatch would let the UI
// offer choices (or limits) the API rejects
test('frontend constants match the backend', async () => {
  const file = path.join(__dirname, '..', '..', 'vit-hostel', 'src', 'constants.js')
  const frontend = await import(pathToFileURL(file).href)
  assert.deepEqual(frontend.HOSTEL_BLOCKS, backend.HOSTEL_BLOCKS)
  assert.deepEqual(frontend.COMPLAINT_TYPES, backend.COMPLAINT_TYPES)
  assert.deepEqual(frontend.COMPLAINT_STATUSES, backend.COMPLAINT_STATUSES)
  assert.deepEqual(frontend.LIMITS, backend.LIMITS)
})
