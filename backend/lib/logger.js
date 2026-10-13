// One JSON line per event on stdout (Vercel keeps these in its logs).
// Never pass request bodies, passwords, tokens or temporary passwords here.
// LOG_LEVEL=silent turns it off (the tests use this).
function log(event, fields = {}) {
  if (process.env.LOG_LEVEL === 'silent') return
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }))
}

// Express middleware: logs method, path (no query string), status, duration
// and the user id once the response has been sent.
function requestLogger(req, res, next) {
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    log('request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - started) / 1000000n),
      userId: req.user ? String(req.user._id) : undefined
    })
  })
  next()
}

module.exports = { log, requestLogger }
