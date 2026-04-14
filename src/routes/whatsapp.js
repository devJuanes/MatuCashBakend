const express = require('express')
const { getStatus, getQr, initWhatsApp, disconnect } = require('../services/whatsappClient')

const router = express.Router()

router.get('/status', async (_req, res) => {
  res.json({ ok: true, data: getStatus() })
})

router.post('/init', async (_req, res) => {
  try {
    await initWhatsApp()
    res.json({ ok: true, data: getStatus() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/qr', async (_req, res) => {
  const qr = getQr()
  res.json({ ok: true, data: qr })
})

router.post('/disconnect', async (_req, res) => {
  await disconnect()
  res.json({ ok: true })
})

module.exports = router
