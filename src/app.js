const express = require('express')
const cors = require('cors')
const env = require('./config/env')
const logger = require('./lib/logger')
const { authMiddleware } = require('./middleware/auth')
const whatsappRoutes = require('./routes/whatsapp')
const whatsappTemplatesRoutes = require('./routes/whatsappTemplates')
const notificationRoutes = require('./routes/notifications')
const uploadRoutes = require('./routes/uploads')
const billingRoutes = require('./routes/billing')

const app = express()
const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '')

if (env.trustProxy) {
  app.set('trust proxy', 1)
}

const corsOriginSet = new Set(env.corsOrigins.map((o) => normalizeOrigin(o)))
app.use(cors({
  origin(origin, callback) {
    // Permite requests sin origin (health checks, curl server-side)
    if (!origin) return callback(null, true)
    const incomingOrigin = normalizeOrigin(origin)
    if (corsOriginSet.has(incomingOrigin)) return callback(null, true)
    return callback(new Error(`CORS bloqueado para origin: ${origin}`))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'matucash-whatsapp-api',
    env: env.nodeEnv,
    timestamp: Date.now(),
    uptimeSec: Math.round(process.uptime()),
    corsOrigins: env.corsOrigins
  })
})

app.use('/api', authMiddleware)
app.use('/api/uploads', uploadRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/whatsapp-templates', whatsappTemplatesRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/billing', billingRoutes)

app.use((err, _req, res, next) => {
  if (err && String(err.message || '').startsWith('CORS bloqueado')) {
    return res.status(403).json({ ok: false, error: err.message })
  }
  return next(err)
})

app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack })
  res.status(500).json({ ok: false, error: 'Internal server error' })
})

module.exports = app
