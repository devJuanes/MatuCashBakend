const express = require('express')
const env = require('../config/env')
const { toWhatsAppId } = require('../lib/phone')
const { sendMessage, sendMediaByUrl, sendMediaFromDataUrl } = require('../services/whatsappClient')
const { renderMessage } = require('../services/notificationWhatsAppTemplates')

const router = express.Router()
const recentNotificationSends = new Map()

function dedupeKey(type, to, payload) {
  const uid = String(payload?.uid || '').trim()
  const loanId = String(payload?.loanId || '').trim()
  const amount = Number(payload?.paymentAmount || 0)
  if (type === 'payment-received') {
    return `${uid}|${to}|${type}|${loanId}|${amount}`
  }
  return `${uid}|${to}|${type}|${loanId}`
}

function shouldSkipDuplicate(type, to, payload, cooldownMs) {
  if (!cooldownMs || cooldownMs <= 0) return false
  const key = dedupeKey(type, to, payload)
  const now = Date.now()
  const prev = recentNotificationSends.get(key)
  if (prev && now - prev < cooldownMs) return true
  recentNotificationSends.set(key, now)
  // Limpieza basica para no crecer indefinidamente
  if (recentNotificationSends.size > 1200) {
    const limit = now - Math.max(
      env.notifCooldownLoanCreatedMs,
      env.notifCooldownPaymentMs,
      env.notifCooldownOverdueMs,
      60_000
    )
    for (const [k, ts] of recentNotificationSends.entries()) {
      if (ts < limit) recentNotificationSends.delete(k)
    }
  }
  return false
}

function requiredPhone(req, res) {
  const phone = req.body?.phone
  const to = toWhatsAppId(phone)
  if (!to) {
    res.status(400).json({ ok: false, error: 'phone es requerido' })
    return null
  }
  return to
}

router.post('/custom', async (req, res) => {
  try {
    const to = requiredPhone(req, res)
    if (!to) return
    const { message } = req.body
    if (!message) return res.status(400).json({ ok: false, error: 'message es requerido' })
    const result = await sendMessage({ to, message })
    return res.json({ ok: true, data: result })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/loan-created', async (req, res) => {
  try {
    const to = requiredPhone(req, res)
    if (!to) return
    const payload = req.body || {}
    if (shouldSkipDuplicate('loan-created', to, payload, env.notifCooldownLoanCreatedMs)) {
      return res.json({ ok: true, skipped: true, reason: 'cooldown' })
    }
    const uid = String(payload.uid || '').trim()
    const message = await renderMessage(uid, 'loanCreated', payload)
    const textResult = await sendMessage({ to, message })

    let mediaResult = null
    let mediaError = null
    if (env.sendTicketMedia && payload.ticketImageBase64) {
      try {
        mediaResult = await sendMediaFromDataUrl({
          to,
          dataUrl: payload.ticketImageBase64,
          caption: 'Ticket digital de tu prestamo',
          filename: `ticket-${payload.loanId || Date.now()}.png`
        })
      } catch (err) {
        mediaError = err instanceof Error ? err.message : 'Error enviando ticket imagen'
      }
    }

    return res.json({ ok: true, data: { textResult, mediaResult, mediaError } })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/payment-received', async (req, res) => {
  try {
    const to = requiredPhone(req, res)
    if (!to) return
    const payload = req.body || {}
    if (shouldSkipDuplicate('payment-received', to, payload, env.notifCooldownPaymentMs)) {
      return res.json({ ok: true, skipped: true, reason: 'cooldown' })
    }
    const uid = String(payload.uid || '').trim()
    const message = await renderMessage(uid, 'paymentReceived', payload)
    const result = await sendMessage({ to, message })
    return res.json({ ok: true, data: result })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/loan-overdue', async (req, res) => {
  try {
    const to = requiredPhone(req, res)
    if (!to) return
    const payload = req.body || {}
    if (shouldSkipDuplicate('loan-overdue', to, payload, env.notifCooldownOverdueMs)) {
      return res.json({ ok: true, skipped: true, reason: 'cooldown' })
    }
    const uid = String(payload.uid || '').trim()
    const message = await renderMessage(uid, 'loanOverdue', payload)
    const result = await sendMessage({ to, message })
    return res.json({ ok: true, data: result })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/send-ticket', async (req, res) => {
  try {
    const to = requiredPhone(req, res)
    if (!to) return
    const { ticketUrl, caption } = req.body || {}
    if (!ticketUrl) return res.status(400).json({ ok: false, error: 'ticketUrl es requerido' })
    const result = await sendMediaByUrl({ to, mediaUrl: ticketUrl, caption })
    return res.json({ ok: true, data: result })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/send-ticket-image', async (req, res) => {
  try {
    const to = requiredPhone(req, res)
    if (!to) return
    const { ticketImageBase64, caption, filename } = req.body || {}
    if (!ticketImageBase64) {
      return res.status(400).json({ ok: false, error: 'ticketImageBase64 es requerido' })
    }
    const result = await sendMediaFromDataUrl({
      to,
      dataUrl: ticketImageBase64,
      caption: caption || 'Ticket de prestamo',
      filename: filename || `ticket-${Date.now()}.png`
    })
    return res.json({ ok: true, data: result })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
