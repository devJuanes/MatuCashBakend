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

const minDelay = toInt(process.env.MIN_SEND_DELAY_MS, 8000)
const maxDelay = toInt(process.env.MAX_SEND_DELAY_MS, 22000)
const preSendMin = toInt(process.env.PRE_SEND_DELAY_MIN_MS, 400)
const preSendMax = toInt(process.env.PRE_SEND_DELAY_MAX_MS, 2200)
const typingMin = toInt(process.env.TYPING_DURATION_MIN_MS, 1200)
const typingMax = toInt(process.env.TYPING_DURATION_MAX_MS, 12000)
const typingBase = toInt(process.env.TYPING_BASE_MS, 600)
const typingPerChar = toInt(process.env.TYPING_MS_PER_CHAR, 28)
const typingJitter = toInt(process.env.TYPING_JITTER_MS, 900)
const loanCreatedCooldown = toInt(process.env.NOTIF_COOLDOWN_LOAN_CREATED_MS, 6 * 60 * 60 * 1000)
const paymentCooldown = toInt(process.env.NOTIF_COOLDOWN_PAYMENT_MS, 90 * 1000)
const overdueCooldown = toInt(process.env.NOTIF_COOLDOWN_OVERDUE_MS, 24 * 60 * 60 * 1000)
const corsOrigins = splitCsv(
  process.env.CORS_ORIGIN || 'https://matucash.com,https://www.matucash.com,http://localhost:5173'
)
const maxUploadMb = Math.min(25, Math.max(1, toInt(process.env.MAX_UPLOAD_MB, 6)))
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
const cashProMonthlyCop = toInt(process.env.CASHPRO_MONTHLY_COP, 15000)
const cashProSemesterCop = toInt(process.env.CASHPRO_SEMESTER_COP, 81000)
const cashProAnnualCop = toInt(process.env.CASHPRO_ANNUAL_COP, 144000)

module.exports = {
  port: toInt(process.env.PORT, 4100),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: corsOrigins.length ? corsOrigins : ['https://matucash.com', 'https://www.matucash.com', 'http://localhost:5173'],
  apiToken: process.env.API_TOKEN || '',
  uploadsDir,
  maxUploadMb,
  maxUploadBytes: maxUploadMb * 1024 * 1024,
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '57',
  whatsappClientId: process.env.WHATSAPP_CLIENT_ID || 'matucash-main',
  minSendDelayMs: Math.max(2000, Math.min(minDelay, maxDelay)),
  maxSendDelayMs: Math.max(minDelay, maxDelay),
  preSendDelayMinMs: Math.max(0, Math.min(preSendMin, preSendMax)),
  preSendDelayMaxMs: Math.max(preSendMin, preSendMax),
  typingMinMs: Math.max(300, Math.min(typingMin, typingMax)),
  typingMaxMs: Math.max(typingMin, typingMax),
  typingBaseMs: Math.max(0, typingBase),
  typingMsPerChar: Math.max(0, typingPerChar),
  typingJitterMs: Math.max(0, typingJitter),
  notifCooldownLoanCreatedMs: Math.max(0, loanCreatedCooldown),
  notifCooldownPaymentMs: Math.max(0, paymentCooldown),
  notifCooldownOverdueMs: Math.max(0, overdueCooldown),
  sendTicketMedia: toBool(process.env.SEND_TICKET_MEDIA, false),
  simulateTyping: toBool(process.env.SIMULATE_TYPING, true),
  headless: toBool(process.env.HEADLESS, true),
  trustProxy: toBool(process.env.TRUST_PROXY, true),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  firebaseServiceAccountFile: process.env.FIREBASE_SERVICE_ACCOUNT_FILE || '',
  frontendAppUrl: String(process.env.FRONTEND_APP_URL || 'https://matucash.com').trim().replace(/\/+$/, ''),
  wompiPublicKey: process.env.WOMPI_PUBLIC_KEY || '',
  wompiPrivateKey: process.env.WOMPI_PRIVATE_KEY || '',
  wompiIntegritySecret: process.env.WOMPI_INTEGRITY_SECRET || '',
  wompiWebhookSecret: process.env.WOMPI_WEBHOOK_SECRET || '',
  wompiBaseUrl: String(process.env.WOMPI_BASE_URL || 'https://production.wompi.co/v1').trim().replace(/\/+$/, ''),
  wompiTestBaseUrl: String(process.env.WOMPI_TEST_BASE_URL || 'https://sandbox.wompi.co/v1').trim().replace(/\/+$/, ''),
  cashProMonthlyCop,
  cashProSemesterCop,
  cashProAnnualCop,
  backupMailerHost: String(process.env.BACKUP_MAILER_HOST || 'smtp.gmail.com').trim(),
  backupMailerPort: toInt(process.env.BACKUP_MAILER_PORT, 465),
  backupMailerSecure: toBool(process.env.BACKUP_MAILER_SECURE, true),
  backupMailerUser: String(process.env.BACKUP_MAILER_USER || '').trim(),
  backupMailerPass: String(process.env.BACKUP_MAILER_PASS || '').trim(),
  backupMailerFrom: String(process.env.BACKUP_MAILER_FROM || process.env.BACKUP_MAILER_USER || '').trim()
}
