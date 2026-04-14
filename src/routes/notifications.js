const express = require('express')
const { toWhatsAppId } = require('../lib/phone')
const { sendMessage, sendMediaByUrl, sendMediaFromDataUrl } = require('../services/whatsappClient')
const {
  loanCreatedTemplate,
  paymentTemplate,
  overdueTemplate
} = require('../templates/notifications')

const router = express.Router()

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
    const message = loanCreatedTemplate(payload)
    const textResult = await sendMessage({ to, message })

    let mediaResult = null
    if (payload.ticketImageBase64) {
      mediaResult = await sendMediaFromDataUrl({
        to,
        dataUrl: payload.ticketImageBase64,
        caption: '🎟️ *Ticket digital de tu préstamo*',
        filename: `ticket-${payload.loanId || Date.now()}.png`
      })
    }

    return res.json({ ok: true, data: { textResult, mediaResult } })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/payment-received', async (req, res) => {
  try {
    const to = requiredPhone(req, res)
    if (!to) return
    const message = paymentTemplate(req.body || {})
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
    const message = overdueTemplate(req.body || {})
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
      caption: caption || '🎟️ Ticket de préstamo',
      filename: filename || `ticket-${Date.now()}.png`
    })
    return res.json({ ok: true, data: result })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
