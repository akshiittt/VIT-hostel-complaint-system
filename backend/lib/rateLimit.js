const RateLimit = require('../models/RateLimit')

// Fixed-window rate limiter backed by MongoDB, so the count is shared across
// every serverless instance. Every attempt counts, successful or not.
function rateLimit({ name, windowMs, max, keyFn }) {
  return async (req, res, next) => {
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    const windowEnd = windowStart + windowMs
    const key = `${name}:${keyFn(req)}:${windowStart}`

    const increment = () => RateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
      { upsert: true, new: true }
    ).lean()

    let entry
    try {
      entry = await increment()
    } catch (error) {
      // Two concurrent upserts for a new key: one inserts, the other hits the
      // unique index. Retrying finds the inserted doc and increments it.
      if (error.code !== 11000) throw error
      entry = await increment()
    }

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000))
      const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
      res.set('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({
        message: `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      })
    }

    next()
  }
}

module.exports = rateLimit
