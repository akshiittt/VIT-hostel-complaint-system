// Local development entry point. On Vercel, api/index.js is used instead.
require('dotenv').config()

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const app = require('./app')
const connectDB = require('./lib/db')

const PORT = process.env.PORT || 5000

connectDB()
  .then(() => console.log('MongoDB connected'))
  .catch((error) => console.error(`MongoDB connection failed: ${error.message}`))

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
