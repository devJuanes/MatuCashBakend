const express = require('express')
const cors = require('cors')
const env = require('./config/env')
const logger = require('./lib/logger')
const { authMiddleware } = require('./middleware/auth')
const whatsappRoutes = require('./routes/whatsapp')
const notificationRoutes = require('./routes/notifications')

const app = express()

app.use(cors({ origin: env.corsOrigin }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'matucash-whatsapp-api',
    env: env.nodeEnv,
    timestamp: Date.now()
  })
})

app.use('/api', authMiddleware)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/notifications', notificationRoutes)

app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack })
  res.status(500).json({ ok: false, error: 'Internal server error' })
})

module.exports = app
