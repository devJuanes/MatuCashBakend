const qrcode = require('qrcode')
const qrcodeTerminal = require('qrcode-terminal')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const env = require('../config/env')
const logger = require('../lib/logger')
const { enqueue } = require('./messageQueue')

let client
let status = 'idle'
let lastQrRaw = null
let lastQrDataUrl = null
let readyAt = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function buildQrData(rawQr) {
  if (!rawQr) return null
  return qrcode.toDataURL(rawQr)
}

function getStatus() {
  return {
    status,
    ready: status === 'ready',
    readyAt,
    hasQr: Boolean(lastQrDataUrl)
  }
}

async function humanPreSendDelay() {
  const ms = randomInt(env.preSendDelayMinMs, env.preSendDelayMaxMs)
  await sleep(ms)
}

function typingDurationMs(message) {
  const len = String(message || '').length
  const base = env.typingBaseMs + len * env.typingMsPerChar
  return Math.min(env.typingMaxMs, Math.max(env.typingMinMs, base + randomInt(0, env.typingJitterMs)))
}

async function simulateHumanTyping(chat, message) {
  if (!env.simulateTyping) return
  await humanPreSendDelay()
  const ms = typingDurationMs(message)
  await chat.sendStateTyping()
  await sleep(ms)
  await chat.clearState()
  await sleep(randomInt(150, 450))
}

async function buildQrDataSafe(rawQr) {
  try {
    return await buildQrData(rawQr)
  } catch {
    return null
  }
}

async function initWhatsApp() {
  if (client) return client

  status = 'starting'
  client = new Client({
    authStrategy: new LocalAuth({ clientId: env.whatsappClientId }),
    puppeteer: {
      headless: env.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  })

  client.on('qr', async (qr) => {
    status = 'qr'
    lastQrRaw = qr
    lastQrDataUrl = await buildQrDataSafe(qr)
    logger.info('Nuevo QR generado para WhatsApp')
    console.log('\n=== ESCANEA ESTE QR EN WHATSAPP ===\n')
    qrcodeTerminal.generate(qr, { small: true })
    console.log('\n=== FIN QR ===\n')
  })

  client.on('authenticated', () => {
    status = 'authenticated'
    logger.info('WhatsApp autenticado')
  })

  client.on('ready', () => {
    status = 'ready'
    readyAt = new Date().toISOString()
    lastQrRaw = null
    lastQrDataUrl = null
    logger.info('WhatsApp listo para enviar mensajes')
  })

  client.on('auth_failure', (msg) => {
    status = 'auth_failure'
    logger.error('Fallo de autenticación WhatsApp', { msg })
  })

  client.on('disconnected', (reason) => {
    status = 'disconnected'
    readyAt = null
    logger.warn('WhatsApp desconectado', { reason })
  })

  await client.initialize()
  return client
}

async function ensureClientReady() {
  if (!client) await initWhatsApp()
  if (status !== 'ready') {
    throw new Error('WhatsApp aún no está listo. Escanea el QR en el servidor.')
  }
  return client
}

async function sendMessage({ to, message }) {
  if (!to || !message) throw new Error('Destino y mensaje son requeridos')

  return enqueue(async () => {
    const currentClient = await ensureClientReady()
    const chat = await currentClient.getChatById(to)
    await simulateHumanTyping(chat, message)
    const result = await currentClient.sendMessage(to, message)
    return {
      id: result.id?._serialized || null,
      to,
      timestamp: Date.now()
    }
  })
}

async function sendMediaByUrl({ to, mediaUrl, caption = '' }) {
  if (!to || !mediaUrl) throw new Error('Destino y mediaUrl son requeridos')

  return enqueue(async () => {
    const currentClient = await ensureClientReady()
    const chat = await currentClient.getChatById(to)
    const cap = caption ? `${caption}\n${mediaUrl}` : mediaUrl
    await simulateHumanTyping(chat, cap)
    try {
      const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true })
      const result = await currentClient.sendMessage(to, media, { caption })
      return {
        id: result.id?._serialized || null,
        to,
        timestamp: Date.now()
      }
    } catch {
      const fallbackText = caption ? `${caption}\n${mediaUrl}` : mediaUrl
      const result = await currentClient.sendMessage(to, fallbackText)
      return {
        id: result.id?._serialized || null,
        to,
        timestamp: Date.now()
      }
    }
  })
}

async function sendMediaFromDataUrl({ to, dataUrl, caption = '', filename = 'ticket.png' }) {
  if (!to || !dataUrl) throw new Error('Destino y dataUrl son requeridos')

  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/)
  if (!match) throw new Error('Formato dataUrl inválido para imagen')
  const mimeType = match[1]
  const base64Data = match[2]
  const media = new MessageMedia(mimeType, base64Data, filename)

  return enqueue(async () => {
    const currentClient = await ensureClientReady()
    const chat = await currentClient.getChatById(to)
    await simulateHumanTyping(chat, caption || 'imagen')
    const result = await currentClient.sendMessage(to, media, { caption })
    return {
      id: result.id?._serialized || null,
      to,
      timestamp: Date.now()
    }
  })
}

function getQr() {
  return {
    qrRaw: lastQrRaw,
    qrDataUrl: lastQrDataUrl
  }
}

async function disconnect() {
  if (!client) return
  await client.destroy()
  client = null
  status = 'idle'
  readyAt = null
  lastQrRaw = null
  lastQrDataUrl = null
}

module.exports = {
  initWhatsApp,
  getStatus,
  getQr,
  sendMessage,
  sendMediaByUrl,
  sendMediaFromDataUrl,
  disconnect
}
