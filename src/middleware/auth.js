const env = require('../config/env')

function authMiddleware(req, res, next) {
  if (!env.apiToken) return next()

  const bearer = req.headers.authorization || ''
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''
  if (token !== env.apiToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  return next()
}

module.exports = { authMiddleware }
