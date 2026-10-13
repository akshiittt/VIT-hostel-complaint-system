// Creates any missing indexes in the database from MONGO_URI (in .env).
// Safe to run any time: it only adds indexes, never drops indexes or data.
// Usage: npm run db:indexes
// If your network's DNS refuses mongodb+srv lookups, set DNS_SERVERS, e.g.
//   DNS_SERVERS=8.8.8.8,1.1.1.1 npm run db:indexes
require('dotenv').config()
if (process.env.DNS_SERVERS) {
  require('dns').setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean))
}
const mongoose = require('mongoose')
const connectDB = require('../lib/db')
const { ensureIndexes, MODELS } = require('../lib/indexes')

async function main() {
  await connectDB()
  const { errors } = await ensureIndexes()
  for (const model of MODELS) {
    const names = (await model.collection.indexes()).map((i) => i.name)
    console.log(`${model.modelName}: ${names.join(', ')}`)
  }
  if (errors.length) {
    console.error('Some indexes could not be built (no data was changed):')
    for (const e of errors) console.error(`  ${e.model}: ${e.error}`)
    console.error('A DuplicateKey error means existing documents break a unique rule; fix those documents, then run this again.')
    process.exitCode = 1
  } else {
    console.log('All indexes are in place.')
  }
}

main()
  .catch((error) => {
    console.error('db:indexes failed:', error.name, error.codeName || '')
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
