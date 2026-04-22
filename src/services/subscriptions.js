const { getAdminDb } = require('./firebaseAdmin')
const { PLAN_CODE } = require('./wompi')
const env = require('../config/env')

function addOneMonthMs(fromMs) {
  const d = new Date(fromMs)
  d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

async function markPendingPayment({ uid, email, fullName, reference }) {
  const db = getAdminDb()
  const now = Date.now()
  const userRef = db.collection('users').doc(uid)
  await userRef.set(
    {
      profile: {
        email: String(email || '').trim(),
        fullName: String(fullName || '').trim()
      },
      subscription: {
        planCode: PLAN_CODE,
        status: 'pending_payment',
        monthlyAmountCop: env.cashProMonthlyCop,
        lastReference: reference,
        updatedAtMs: now
      }
    },
    { merge: true }
  )
}

async function activateSubscription({ uid, transactionId, reference }) {
  const db = getAdminDb()
  const now = Date.now()
  const userRef = db.collection('users').doc(uid)
  const snap = await userRef.get()

  const previousEnd = Number(snap.get('subscription.currentPeriodEndMs') || 0)
  const periodStart = previousEnd > now ? previousEnd : now
  const periodEnd = addOneMonthMs(periodStart)

  await userRef.set(
    {
      subscription: {
        planCode: PLAN_CODE,
        status: 'active',
        monthlyAmountCop: env.cashProMonthlyCop,
        currentPeriodStartMs: periodStart,
        currentPeriodEndMs: periodEnd,
        lastReference: reference,
        lastTransactionId: transactionId,
        updatedAtMs: now
      }
    },
    { merge: true }
  )

  return {
    status: 'active',
    periodEndMs: periodEnd
  }
}

async function markPaymentIssue({ uid, reason }) {
  const db = getAdminDb()
  const now = Date.now()
  const userRef = db.collection('users').doc(uid)
  await userRef.set(
    {
      subscription: {
        planCode: PLAN_CODE,
        status: 'past_due',
        lastError: String(reason || '').slice(0, 180),
        updatedAtMs: now
      }
    },
    { merge: true }
  )
}

async function getSubscriptionStatus(uid) {
  const db = getAdminDb()
  const userRef = db.collection('users').doc(uid)
  const snap = await userRef.get()
  const subscription = snap.get('subscription') || {}
  const status = String(subscription.status || 'inactive')
  const planCode = String(subscription.planCode || '')
  const periodEndMs = Number(subscription.currentPeriodEndMs || 0)
  const isActive = planCode === PLAN_CODE && status === 'active' && periodEndMs > Date.now()

  return {
    planCode,
    status: isActive ? 'active' : status,
    periodEndMs,
    monthlyAmountCop: Number(subscription.monthlyAmountCop || env.cashProMonthlyCop),
    isActive
  }
}

module.exports = {
  markPendingPayment,
  activateSubscription,
  markPaymentIssue,
  getSubscriptionStatus
}
