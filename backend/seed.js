// Creates the warden account, or updates its name and password if it already
// exists. Never deletes users. Students sign up on the website.
// Usage: npm run seed   (reads MONGO_URI and SEED_WARDEN_* from .env)
// SEED_WARDEN_PASSWORD (8+ chars) is required unless MONGO_URI is localhost.
require('dotenv').config()
const mongoose = require('mongoose')
const connectDB = require('./lib/db')
const User = require('./models/User')
const { planSeed, resolvePassword } = require('./lib/seedPlan')

const name = process.env.SEED_WARDEN_NAME || 'Warden Kumar'
const email = (process.env.SEED_WARDEN_EMAIL || 'warden@vithostel.com').trim().toLowerCase()

async function seed() {
  // Check the password before connecting so a bad config never touches the DB
  const precheck = resolvePassword(process.env)
  if (precheck.error) {
    console.error(`Seed aborted: ${precheck.error}`)
    process.exitCode = 1
    return
  }

  await connectDB()

  const existingUser = await User.findOne({ email })
  const plan = planSeed({ env: process.env, existingUser })

  if (plan.action === 'abort') {
    console.error(`Seed aborted: ${plan.reason} (${email}). No changes made.`)
    process.exitCode = 1
    return
  }
  if (plan.warning) console.warn(plan.warning)

  // Plain password on purpose: the User pre-save hook hashes it exactly once
  if (plan.action === 'update') {
    existingUser.name = name
    existingUser.password = plan.password
    await existingUser.save()
    console.log(`Warden account updated: ${email}`)
  } else {
    await User.create({ name, email, password: plan.password, role: 'warden' })
    console.log(`Warden account created: ${email}`)
  }
}

seed()
  .catch((error) => {
    console.error('Seed error:', error.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
