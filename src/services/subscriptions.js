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

async function activateSubscription({ uid, transactionId, reference, paymentSourceId }) {
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
        ...(paymentSourceId ? { paymentSourceId: Number(paymentSourceId) } : {}),
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

async function listDueRenewals(limit = 20) {
  const db = getAdminDb()
  const now = Date.now()
  const snap = await db
    .collection('users')
    .where('subscription.status', '==', 'active')
    .where('subscription.currentPeriodEndMs', '<=', now)
    .limit(Math.max(1, Math.min(50, Number(limit) || 20)))
    .get()

  return snap.docs.map((d) => {
    const data = d.data() || {}
    const profile = data.profile || {}
    const subscription = data.subscription || {}
    return {
      uid: d.id,
      email: String(profile.email || ''),
      paymentSourceId: Number(subscription.paymentSourceId || 0),
      currentPeriodEndMs: Number(subscription.currentPeriodEndMs || 0)
    }
  })
}

async function markRenewalSuccess({ uid, transactionId, reference }) {
  return activateSubscription({ uid, transactionId, reference })
}

async function markRenewalFailed({ uid, reason }) {
  return markPaymentIssue({ uid, reason })
}

module.exports = {
  markPendingPayment,
  activateSubscription,
  markPaymentIssue,
  getSubscriptionStatus,
  listDueRenewals,
  markRenewalSuccess,
  markRenewalFailed
}
