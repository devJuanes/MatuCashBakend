const dotenv = require('dotenv')

dotenv.config()

function toBool(value, fallback = false) {
  if (value == null) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function toInt(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function splitCsv(value) {
  const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '')
  return String(value || '')
    .split(',')
    .map((x) => normalizeOrigin(x))
    .filter(Boolean)
}

const minDelay = toInt(process.env.MIN_SEND_DELAY_MS, 5000)
const maxDelay = toInt(process.env.MAX_SEND_DELAY_MS, 12000)
const corsOrigins = splitCsv(process.env.CORS_ORIGIN || 'http://localhost:5173')

module.exports = {
  port: toInt(process.env.PORT, 4100),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins,
  apiToken: process.env.API_TOKEN || '',
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '57',
  whatsappClientId: process.env.WHATSAPP_CLIENT_ID || 'matucash-main',
  minSendDelayMs: Math.max(1000, Math.min(minDelay, maxDelay)),
  maxSendDelayMs: Math.max(minDelay, maxDelay),
  simulateTyping: toBool(process.env.SIMULATE_TYPING, true),
  headless: toBool(process.env.HEADLESS, true),
  trustProxy: toBool(process.env.TRUST_PROXY, true)
}
