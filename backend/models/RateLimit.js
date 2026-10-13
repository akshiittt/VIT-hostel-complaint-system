const mongoose = require('mongoose')

// One document per (limiter, client, window). Stored in MongoDB rather than
// memory because Vercel serverless instances don't share memory.
const rateLimitSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  count: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date,
    required: true
  }
})

// MongoDB's TTL monitor deletes each counter once its window has ended
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema)
