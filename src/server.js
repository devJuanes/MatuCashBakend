const app = require('./app')
const env = require('./config/env')
const logger = require('./lib/logger')
const { initWhatsApp } = require('./services/whatsappClient')

app.listen(env.port, async () => {
  logger.info(`MatuCash WhatsApp API listening on :${env.port}`)
  try {
    await initWhatsApp()
  } catch (err) {
    logger.warn('No se pudo inicializar WhatsApp al arrancar', { error: err.message })
  }
})
