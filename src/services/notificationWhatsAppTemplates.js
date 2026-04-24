const { getAdminDb } = require('./firebaseAdmin')

const FIELD = 'notificationWhatsApp'

const DEFAULT_TEMPLATES = {
  loanCreated: [
    'Hola {{clientName}}, como vas?',
    '',
    'Te confirmo que ya quedo registrado tu prestamo.',
    'Monto: {{amount}}',
    'Total a pagar: {{total}}',
    'Vence: {{dueDate}}',
    'Ref: {{loanId}}',
    '',
    'Cualquier duda me escribes. Gracias.',
    '{{ticketLine}}'
  ].join('\n'),
  paymentReceived: [
    'Hola {{clientName}}, gracias por tu pago.',
    '',
    'Abono recibido: {{paymentAmount}}',
    'Saldo pendiente: {{remaining}}',
    'Ref: {{loanId}}',
    '',
    '{{paidClosingLine}}'
  ].join('\n'),
  loanOverdue: [
    'Hola {{clientName}}, te escribo para recordarte tu cuota pendiente.',
    '',
    'Dias de atraso: {{overdueDays}}',
    'Saldo pendiente: {{remaining}}',
    'Vencia: {{dueDate}}',
    'Ref: {{loanId}}',
    '',
    'Cuando puedas, por favor ponte al dia. Gracias.'
  ].join('\n')
}

function money(value, currency = 'COP') {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(Number(value || 0))
  } catch {
    return `$${Number(value || 0)}`
  }
}

function sanitizeUid(uid) {
  return String(uid || '').trim()
}

function sanitizeTemplate(value, fallback) {
  const text = String(value || '').trim()
  return text ? text.slice(0, 4000) : fallback
}

function normalizeStored(raw = {}) {
  const t = raw.templates || {}
  return {
    enabled: raw.enabled !== false,
    templates: {
      loanCreated: sanitizeTemplate(t.loanCreated, DEFAULT_TEMPLATES.loanCreated),
      paymentReceived: sanitizeTemplate(t.paymentReceived, DEFAULT_TEMPLATES.paymentReceived),
      loanOverdue: sanitizeTemplate(t.loanOverdue, DEFAULT_TEMPLATES.loanOverdue)
    },
    updatedAtMs: Number(raw.updatedAtMs || 0) || null
  }
}

async function getConfigForUid(uid) {
  const clean = sanitizeUid(uid)
  if (!clean) {
    return normalizeStored({})
  }
  try {
    const db = getAdminDb()
    const snap = await db.collection('users').doc(clean).get()
    return normalizeStored(snap.get(FIELD) || {})
  } catch {
    return normalizeStored({})
  }
}

async function upsertConfig(uid, input) {
  const clean = sanitizeUid(uid)
  if (!clean) throw new Error('uid inválido')
  const previous = await getConfigForUid(clean)
  const merged = normalizeStored({
    enabled: input.enabled !== undefined ? input.enabled : previous.enabled,
    templates: {
      ...previous.templates,
      ...(input.templates || {})
    }
  })
  const now = Date.now()
  const db = getAdminDb()
  await db.collection('users').doc(clean).set(
    {
      [FIELD]: {
        enabled: merged.enabled,
        templates: merged.templates,
        updatedAtMs: now
      }
    },
    { merge: true }
  )
  return { ...merged, updatedAtMs: now }
}

function buildValues(payload = {}) {
  const ticketUrl = String(payload.ticketUrl || '').trim()
  const ticketLine = ticketUrl ? `Ticket: ${ticketUrl}` : ''
  const remainingNum = Number(payload.remaining ?? 0)
  const paidClosingLine =
    remainingNum <= 0 ? 'Tu prestamo quedo al dia. Gracias por cumplir.' : 'Gracias, te sigo avisando del siguiente abono.'

  return {
    clientName: String(payload.clientName || 'Cliente'),
    amount: money(payload.amount),
    total: money(payload.total),
    dueDate: String(payload.dueDate || ''),
    loanId: String(payload.loanId || ''),
    ticketUrl,
    ticketLine,
    paymentAmount: money(payload.paymentAmount),
    remaining: money(payload.remaining),
    overdueDays: String(Number(payload.overdueDays || 1)),
    paidClosingLine
  }
}

function renderTemplate(template, payload) {
  const values = buildValues(payload)
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = values[key]
    return v == null ? '' : String(v)
  })
}

async function renderMessage(uid, templateKey, payload) {
  const cfg = await getConfigForUid(uid)
  const template = cfg.enabled
    ? (cfg.templates[templateKey] || DEFAULT_TEMPLATES[templateKey])
    : DEFAULT_TEMPLATES[templateKey]
  return renderTemplate(template, payload).replace(/\n{3,}/g, '\n\n').trim()
}

module.exports = {
  DEFAULT_TEMPLATES,
  getConfigForUid,
  upsertConfig,
  renderMessage
}
