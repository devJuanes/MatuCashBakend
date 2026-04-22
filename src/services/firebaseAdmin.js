const admin = require('firebase-admin')
const fs = require('fs')
const env = require('../config/env')
const logger = require('../lib/logger')

let started = false

function parseServiceAccount(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (_err) {
    return null
  }
}

function readServiceAccountFromFile(filePath) {
  const path = String(filePath || '').trim()
  if (!path) return null
  try {
    if (!fs.existsSync(path)) {
      logger.warn('No existe FIREBASE_SERVICE_ACCOUNT_FILE', { path })
      return null
    }
    const raw = fs.readFileSync(path, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    logger.error('No se pudo leer FIREBASE_SERVICE_ACCOUNT_FILE', { message: err.message })
    return null
  }
}

function initAdmin() {
  if (started) return
  started = true

  if (admin.apps.length > 0) return

  const serviceAccount =
    parseServiceAccount(env.firebaseServiceAccountJson) ||
    readServiceAccountFromFile(env.firebaseServiceAccountFile)

  try {
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: env.firebaseProjectId || serviceAccount.project_id
      })
      logger.info('Firebase Admin inicializado con service account')
      return
    }

    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...(env.firebaseProjectId ? { projectId: env.firebaseProjectId } : {})
    })
    logger.info('Firebase Admin inicializado con credenciales por defecto')
  } catch (err) {
    started = false
    logger.error('No se pudo inicializar Firebase Admin', {
      message: err.message,
      hint:
        'Configura FIREBASE_PROJECT_ID y FIREBASE_SERVICE_ACCOUNT_FILE o FIREBASE_SERVICE_ACCOUNT_JSON'
    })
    throw err
  }
}

function getAdminDb() {
  initAdmin()
  return admin.firestore()
}

module.exports = {
  getAdminDb
}
