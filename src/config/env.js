const path = require('path')
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
const maxUploadMb = Math.min(25, Math.max(1, toInt(process.env.MAX_UPLOAD_MB, 6)))
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))

module.exports = {
  port: toInt(process.env.PORT, 4100),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins,
  apiToken: process.env.API_TOKEN || '',
  uploadsDir,
  maxUploadMb,
  maxUploadBytes: maxUploadMb * 1024 * 1024,
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '57',
  whatsappClientId: process.env.WHATSAPP_CLIENT_ID || 'matucash-main',
  minSendDelayMs: Math.max(1000, Math.min(minDelay, maxDelay)),
  maxSendDelayMs: Math.max(minDelay, maxDelay),
  simulateTyping: toBool(process.env.SIMULATE_TYPING, true),
  headless: toBool(process.env.HEADLESS, true),
  trustProxy: toBool(process.env.TRUST_PROXY, true),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  firebaseServiceAccountFile: process.env.FIREBASE_SERVICE_ACCOUNT_FILE || '',
  frontendAppUrl: String(process.env.FRONTEND_APP_URL || 'http://localhost:5173').trim().replace(/\/+$/, ''),
  wompiPublicKey: process.env.WOMPI_PUBLIC_KEY || '',
  wompiPrivateKey: process.env.WOMPI_PRIVATE_KEY || '',
  wompiIntegritySecret: process.env.WOMPI_INTEGRITY_SECRET || '',
  wompiWebhookSecret: process.env.WOMPI_WEBHOOK_SECRET || '',
  wompiBaseUrl: String(process.env.WOMPI_BASE_URL || 'https://production.wompi.co/v1').trim().replace(/\/+$/, ''),
  cashProMonthlyCop: toInt(process.env.CASHPRO_MONTHLY_COP, 20000),
  renewalCheckMs: Math.max(60000, toInt(process.env.RENEWAL_CHECK_MS, 6 * 60 * 60 * 1000))
}
