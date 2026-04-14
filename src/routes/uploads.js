const express = require('express')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const multer = require('multer')
const env = require('../config/env')
const logger = require('../lib/logger')

const router = express.Router()

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

function extFromMime(mime) {
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return null
}

function safeStoredName(name) {
  const s = String(name || '').trim()
  const m = s.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(jpg|jpeg|png|webp)$/i)
  if (!m) return null
  const base = m[1]
  const ext = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase()
  return `${base}.${ext}`
}

function cedulaDir() {
  const dir = path.join(env.uploadsDir, 'cedula')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, cedulaDir()),
  filename: (_req, file, cb) => {
    const ext = extFromMime(file.mimetype)
    if (!ext) return cb(new Error('Tipo de imagen no permitido'))
    cb(null, `${crypto.randomUUID()}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true)
    cb(new Error('Solo se permiten imágenes JPEG, PNG o WebP'))
  }
})

/**
 * POST /api/uploads/cedula
 * multipart: file (campo "file"), clientId (texto, opcional para auditoría), replaceOf (nombre archivo anterior a borrar)
 */
router.post('/cedula', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const isMulter = err instanceof multer.MulterError
      const msg = isMulter && err.code === 'LIMIT_FILE_SIZE'
        ? `Archivo demasiado grande (máx. ${env.maxUploadMb} MB)`
        : err.message
      return res.status(400).json({ ok: false, error: msg })
    }
    next()
  })
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Falta el archivo (campo "file")' })
    }
    const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId.slice(0, 128) : ''
    const replaceOf = safeStoredName(req.body?.replaceOf)
    if (replaceOf) {
      const oldPath = path.join(cedulaDir(), replaceOf)
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
      } catch (e) {
        logger.warn('No se pudo borrar imagen anterior de cédula', { replaceOf, message: e.message })
      }
    }
    if (clientId) {
      logger.info('Cédula subida', { clientId, file: req.file.filename })
    }
    return res.json({
      ok: true,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    })
  } catch (err) {
    logger.error('upload cedula', { message: err.message })
    return res.status(500).json({ ok: false, error: 'Error guardando archivo' })
  }
})

/**
 * GET /api/uploads/cedula/:fileName
 * Misma autenticación Bearer que el resto de /api (middleware global).
 */
router.get('/cedula/:fileName', (req, res) => {
  const safe = safeStoredName(req.params.fileName)
  if (!safe) {
    return res.status(400).json({ ok: false, error: 'Nombre de archivo inválido' })
  }
  const dir = path.resolve(cedulaDir())
  const abs = path.resolve(path.join(dir, safe))
  const rel = path.relative(dir, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return res.status(400).json({ ok: false, error: 'Ruta inválida' })
  }
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ ok: false, error: 'No encontrado' })
  }
  return res.sendFile(abs, { maxAge: 86400000, immutable: false })
})

module.exports = router
