const env = require('../config/env')
const logger = require('../lib/logger')
const { createRecurringCharge } = require('./wompi')
const { listDueRenewals, markRenewalSuccess, markRenewalFailed } = require('./subscriptions')

let timer = null
let running = false

async function runRenewalSweep() {
  if (running) return
  running = true
  try {
    const due = await listDueRenewals(20)
    if (!due.length) return

    for (const sub of due) {
      if (!sub.paymentSourceId || !sub.email) {
        await markRenewalFailed({
          uid: sub.uid,
          reason: 'Sin paymentSourceId/email para cobro automático'
        })
        continue
      }

      try {
        const tx = await createRecurringCharge({
          uid: sub.uid,
          email: sub.email,
          paymentSourceId: sub.paymentSourceId
        })
        const status = String(tx?.status || '').toUpperCase()
        if (status === 'APPROVED') {
          await markRenewalSuccess({
            uid: sub.uid,
            transactionId: String(tx.id || ''),
            reference: String(tx.reference || '')
          })
        } else {
          await markRenewalFailed({
            uid: sub.uid,
            reason: `Cobro automático rechazado: ${status || 'UNKNOWN'}`
          })
        }
      } catch (err) {
        await markRenewalFailed({
          uid: sub.uid,
          reason: err.message || 'Error en cobro automático'
        })
      }
    }
  } catch (err) {
    logger.error('Error ejecutando renovación automática', { message: err.message })
  } finally {
    running = false
  }
}

function startRenewalRunner() {
  if (timer) return
  timer = setInterval(() => {
    void runRenewalSweep()
  }, env.renewalCheckMs)
  void runRenewalSweep()
  logger.info('Renovación automática inicializada', { everyMs: env.renewalCheckMs })
}

module.exports = {
  startRenewalRunner
}
