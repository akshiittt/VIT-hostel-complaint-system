const express = require('express')
const cors = require('cors')
const connectDB = require('./lib/db')
const { missingConfig, parseAllowedOrigins } = require('./lib/config')

const app = express()

// Vercel sits behind exactly one proxy; this makes req.ip the client's IP
// (used as the rate-limit key) instead of the proxy's.
app.set('trust proxy', 1)

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)

app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '100kb' }))

app.get('/', (req, res) => {
  res.json({ message: 'VIT Hostel Backend API is running' })
})

// Reports missing env var names (never values) so a broken deploy is obvious
app.get('/api/health', (req, res) => {
  const missing = missingConfig()
  if (missing.length) {
    return res.status(503).json({ status: 'misconfigured', missing })
  }
  res.json({ status: 'ok' })
})

// Every /api route below needs the database; connect lazily (and reuse the
// connection) so serverless cold starts only pay for it when actually needed.
// Vercel never runs server.js, so config is checked here on each request.
app.use('/api', async (req, res, next) => {
  const missing = missingConfig()
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`)
    return res.status(500).json({ message: 'Server is not configured correctly' })
  }
  await connectDB()
  next()
})

app.use('/api/auth', require('./routes/auth'))
app.use('/api/complaints', require('./routes/complaints'))

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

// Express 5 forwards errors thrown in async handlers here
app.use((err, req, res, next) => {
  // Unique index violation, e.g. two simultaneous sign-ups with one email
  if (err.code === 11000) {
    return res.status(409).json({ message: 'An account with this email already exists' })
  }
  // Client errors raised by middleware such as express.json (bad JSON, 413)
  if (err.expose && err.status >= 400 && err.status < 500) {
    let message = err.message
    if (err.status === 413) message = 'Request body is too large'
    else if (err.type === 'entity.parse.failed') message = 'Invalid JSON body'
    return res.status(err.status).json({ message })
  }
  console.error(err)
  res.status(500).json({ message: 'Something went wrong on the server' })
})

module.exports = app
