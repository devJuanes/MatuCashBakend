const { getAdminDb } = require('./firebaseAdmin')
const { PLAN_CODE, normalizePeriod, PERIOD_MONTHS, amountForPeriod } = require('./wompi')
const env = require('../config/env')

function addMonthsMs(fromMs, months) {
  const d = new Date(fromMs)
  d.setMonth(d.getMonth() + Math.max(1, Number(months) || 1))
  return d.getTime()
}

async function markPendingPayment({ uid, email, fullName, reference }) {
  const db = getAdminDb()
  const now = Date.now()
  const period = normalizePeriod(String(reference || '').split('_')[1] || 'monthly')
  const userRef = db.collection('users').doc(uid)
  await userRef.set(
    {
      profile: {
        email: String(email || '').trim(),
        fullName: String(fullName || '').trim()
      },
      subscription: {
        planCode: PLAN_CODE,
        billingPeriod: period,
        status: 'pending_payment',
        currentAmountCop: amountForPeriod(period),
        monthlyAmountCop: env.cashProMonthlyCop,
        lastReference: reference,
        updatedAtMs: now
      }
    },
    { merge: true }
  )
}

async function activateSubscription({ uid, transactionId, reference, planPeriod }) {
  const db = getAdminDb()
  const now = Date.now()
  const period = normalizePeriod(planPeriod || String(reference || '').split('_')[1] || 'monthly')
  const months = PERIOD_MONTHS[period] || 1
  const userRef = db.collection('users').doc(uid)
  const snap = await userRef.get()

  const previousEnd = Number(snap.get('subscription.currentPeriodEndMs') || 0)
  const periodStart = previousEnd > now ? previousEnd : now
  const periodEnd = addMonthsMs(periodStart, months)

  await userRef.set(
    {
      subscription: {
        planCode: PLAN_CODE,
        billingPeriod: period,
        status: 'active',
        currentAmountCop: amountForPeriod(period),
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

  await userRef.collection('subscription_payments').doc(transactionId || `${now}`).set({
    transactionId: String(transactionId || ''),
    reference: String(reference || ''),
    billingPeriod: period,
    amountCop: amountForPeriod(period),
    paidAtMs: now
  })

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
  const billingPeriod = normalizePeriod(subscription.billingPeriod || 'monthly')
  const periodEndMs = Number(subscription.currentPeriodEndMs || 0)
  const isActive = planCode === PLAN_CODE && status === 'active' && periodEndMs > Date.now()
  const paymentsSnap = await userRef
    .collection('subscription_payments')
    .orderBy('paidAtMs', 'desc')
    .limit(20)
    .get()
  const recentPayments = paymentsSnap.docs.map((doc) => {
    const d = doc.data() || {}
    return {
      id: doc.id,
      transactionId: String(d.transactionId || ''),
      billingPeriod: normalizePeriod(d.billingPeriod || 'monthly'),
      amountCop: Number(d.amountCop || 0),
      paidAtMs: Number(d.paidAtMs || 0)
    }
  })

  return {
    planCode,
    billingPeriod,
    status: isActive ? 'active' : status,
    periodEndMs,
    currentAmountCop: Number(subscription.currentAmountCop || amountForPeriod(billingPeriod)),
    monthlyAmountCop: Number(subscription.monthlyAmountCop || env.cashProMonthlyCop),
    recentPayments,
    isActive
  }
}

module.exports = {
  markPendingPayment,
  activateSubscription,
  markPaymentIssue,
  getSubscriptionStatus
}
