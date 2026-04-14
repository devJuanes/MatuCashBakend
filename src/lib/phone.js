const env = require('../config/env')

function normalizePhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith(env.defaultCountryCode)) {
    return digits
  }

  if (digits.length <= 10) {
    return `${env.defaultCountryCode}${digits}`
  }

  return digits
}

function toWhatsAppId(rawPhone) {
  const normalized = normalizePhone(rawPhone)
  return normalized ? `${normalized}@c.us` : ''
}

module.exports = {
  normalizePhone,
  toWhatsAppId
}
