const express = require('express')
const logger = require('../lib/logger')
const { sendBackupByEmail, getBackupStats } = require('../services/backups')

const router = express.Router()

router.post('/send', async (req, res) => {
  const uid = String(req.body?.uid || '').trim()
  const email = String(req.body?.email || '').trim()
  if (!uid || !email) {
    return res.status(400).json({ ok: false, error: 'uid y email son requeridos' })
  }
  try {
    const data = await sendBackupByEmail(req.body)
    return res.json({
      ok: true,
      data: {
        backupsCount: data.backupsCount,
        summary: data.report.summary,
        rangeLabel: data.report.rangeLabel
      }
    })
  } catch (err) {
    logger.error('Error enviando copia de seguridad', { message: err.message })
    return res.status(500).json({ ok: false, error: err.message || 'No se pudo enviar la copia' })
  }
})

router.get('/stats/:uid', async (req, res) => {
  const uid = String(req.params?.uid || '').trim()
  if (!uid) return res.status(400).json({ ok: false, error: 'uid inválido' })
  try {
    const data = await getBackupStats(uid)
    return res.json({ ok: true, data })
  } catch (err) {
    logger.error('Error consultando backups', { message: err.message })
    return res.status(500).json({ ok: false, error: err.message || 'No se pudo consultar backups' })
  }
})

module.exports = router
