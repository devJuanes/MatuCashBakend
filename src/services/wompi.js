const crypto = require('crypto')
const env = require('../config/env')

const PLAN_CODE = 'cashpro'
const PLAN_CURRENCY = 'COP'
const PERIOD_MONTHS = {
  monthly: 1,
  semester: 6,
  annual: 12
}

function normalizePeriod(input) {
  const period = String(input || '').trim().toLowerCase()
  if (period === 'semester') return 'semester'
  if (period === 'annual') return 'annual'
  return 'monthly'
}

function amountForPeriod(period) {
  if (period === 'semester') return env.cashProSemesterCop
  if (period === 'annual') return env.cashProAnnualCop
  return env.cashProMonthlyCop
}

function buildReference(uid, period) {
  return `${PLAN_CODE}_${period}_${uid}_${Date.now()}`
}

function resolveWompiBaseUrl(environment) {
  const mode = String(environment || '').trim().toLowerCase()
  if (mode === 'test') return env.wompiTestBaseUrl
  if (mode === 'prod' || mode === 'production') return env.wompiBaseUrl
  const keyLooksTest = String(env.wompiPrivateKey || '').startsWith('prv_test_')
  return keyLooksTest ? env.wompiTestBaseUrl : env.wompiBaseUrl
}

function buildCheckoutUrl({ uid, email, fullName, phone, redirectUrl, planPeriod }) {
  if (!env.wompiPublicKey) throw new Error('Falta WOMPI_PUBLIC_KEY')
  if (!env.wompiIntegritySecret) throw new Error('Falta WOMPI_INTEGRITY_SECRET')

  const period = normalizePeriod(planPeriod)
  const reference = buildReference(uid, period)
  const amountInCents = amountForPeriod(period) * 100
  const signature = crypto
    .createHash('sha256')
    .update(`${reference}${amountInCents}${PLAN_CURRENCY}${env.wompiIntegritySecret}`)
    .digest('hex')

  const params = new URLSearchParams({
    'public-key': env.wompiPublicKey,
    currency: PLAN_CURRENCY,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': signature,
    'redirect-url': redirectUrl || `${env.frontendAppUrl}/billing/return`
  })

  // customer-data:* es opcional. Lo omitimos para evitar que librerías de terceros
  // intenten sanitizar query params con PII y rompan el parsing del checkout.
  void email
  void fullName
  void phone

  return {
    reference,
    period,
    amountInCents,
    currency: PLAN_CURRENCY,
    checkoutUrl: `https://checkout.wompi.co/p/?${params.toString()}`
  }
}

async function getTransaction(transactionId, options = {}) {
  if (!env.wompiPrivateKey) throw new Error('Falta WOMPI_PRIVATE_KEY')
  const id = String(transactionId || '').trim()
  if (!id) throw new Error('transactionId es requerido')
  const baseUrl = resolveWompiBaseUrl(options.environment)
  const res = await fetch(`${baseUrl}/transactions/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.wompiPrivateKey}`,
      'Content-Type': 'application/json'
    }
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = payload?.error?.reason || payload?.error?.type || `HTTP ${res.status}`
    throw new Error(`No se pudo consultar la transacción en Wompi: ${reason}`)
  }
  return payload?.data || null
}

module.exports = {
  PLAN_CODE,
  PLAN_CURRENCY,
  PERIOD_MONTHS,
  normalizePeriod,
  amountForPeriod,
  buildCheckoutUrl,
  getTransaction
}
