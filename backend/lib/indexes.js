const User = require('../models/User')
const Complaint = require('../models/Complaint')
const RateLimit = require('../models/RateLimit')
const { log } = require('./logger')

const MODELS = [User, Complaint, RateLimit]

// Mongoose builds missing indexes automatically when a model is first used
// (autoIndex). If a build fails, e.g. a unique index blocked by existing
// duplicates, it only emits an 'index' event; log it so it isn't silent.
// Only the error code is logged: the message can contain the duplicate value.
for (const model of MODELS) {
  model.on('index', (error) => {
    if (error) log('index_error', { model: model.modelName, error: error.codeName || error.name })
  })
}

// Creates any missing indexes. Non-destructive: unlike Model.syncIndexes(), it
// never drops an index that isn't in the schema, and it never touches data.
// Used by `npm run db:indexes`.
async function ensureIndexes() {
  const errors = []
  for (const model of MODELS) {
    try {
      await model.createIndexes()
    } catch (error) {
      const code = error.codeName || error.name
      log('index_error', { model: model.modelName, error: code })
      errors.push({ model: model.modelName, error: code })
    }
  }
  return { errors }
}

module.exports = { ensureIndexes, MODELS }
