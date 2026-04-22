const express = require('express')
const { getConfigForUid, upsertConfig } = require('../services/notificationWhatsAppTemplates')

const router = express.Router()

function sanitizeUid(uid) {
  return String(uid || '').trim()
}

router.get('/:uid', async (req, res) => {
  const uid = sanitizeUid(req.params.uid)
  if (!uid) return res.status(400).json({ ok: false, error: 'uid inválido' })
  try {
    const data = await getConfigForUid(uid)
    return res.json({ ok: true, data })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.put('/:uid', async (req, res) => {
  const uid = sanitizeUid(req.params.uid)
  if (!uid) return res.status(400).json({ ok: false, error: 'uid inválido' })
  try {
    const data = await upsertConfig(uid, req.body || {})
    return res.json({ ok: true, data })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
