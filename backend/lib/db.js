const mongoose = require('mongoose')

// On Vercel each request may run in a fresh or a reused function instance.
// Caching the connection promise on `global` lets warm instances reuse it
// instead of opening a new connection per request.
let cached = global._mongoose
if (!cached) {
  cached = global._mongoose = { promise: null }
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set')
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
      .catch((error) => {
        // Allow the next request to retry instead of reusing a failed promise
        cached.promise = null
        throw error
      })
  }

  await cached.promise
  return mongoose.connection
}

module.exports = connectDB
