const crypto = require('crypto')
const env = require('../config/env')

const PLAN_CODE = 'cashpro'
const PLAN_CURRENCY = 'COP'

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `57${digits}`
  if (digits.length === 12 && digits.startsWith('57')) return digits
  return digits
}

function buildReference(uid) {
  return `${PLAN_CODE}_${uid}_${Date.now()}`
}

function buildCheckoutUrl({ uid, email, fullName, phone, redirectUrl }) {
  if (!env.wompiPublicKey) throw new Error('Falta WOMPI_PUBLIC_KEY')
  if (!env.wompiIntegritySecret) throw new Error('Falta WOMPI_INTEGRITY_SECRET')

  const reference = buildReference(uid)
  const amountInCents = env.cashProMonthlyCop * 100
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

  if (email) params.set('customer-data:email', email.trim())
  if (fullName) params.set('customer-data:full-name', fullName.trim())
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone) params.set('customer-data:phone-number', normalizedPhone)

  return {
    reference,
    amountInCents,
    currency: PLAN_CURRENCY,
    checkoutUrl: `https://checkout.wompi.co/l/?${params.toString()}`
  }
}

async function getTransaction(transactionId) {
  if (!env.wompiPrivateKey) throw new Error('Falta WOMPI_PRIVATE_KEY')
  const id = String(transactionId || '').trim()
  if (!id) throw new Error('transactionId es requerido')
  const res = await fetch(`${env.wompiBaseUrl}/transactions/${encodeURIComponent(id)}`, {
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

async function createRecurringCharge({ uid, email, paymentSourceId }) {
  if (!env.wompiPrivateKey) throw new Error('Falta WOMPI_PRIVATE_KEY')
  const sourceId = Number(paymentSourceId)
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    throw new Error('paymentSourceId inválido para cobro recurrente')
  }
  const reference = buildReference(uid)
  const amountInCents = env.cashProMonthlyCop * 100
  const payload = {
    amount_in_cents: amountInCents,
    currency: PLAN_CURRENCY,
    customer_email: String(email || '').trim(),
    payment_method: {
      installments: 1
    },
    reference,
    payment_source_id: sourceId
  }

  const res = await fetch(`${env.wompiBaseUrl}/transactions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.wompiPrivateKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = body?.error?.reason || body?.error?.type || `HTTP ${res.status}`
    throw new Error(`No se pudo crear cobro recurrente: ${reason}`)
  }
  return body?.data || null
}

module.exports = {
  PLAN_CODE,
  PLAN_CURRENCY,
  buildCheckoutUrl,
  getTransaction,
  createRecurringCharge
}
