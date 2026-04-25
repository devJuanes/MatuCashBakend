const PDFDocument = require('pdfkit')
const nodemailer = require('nodemailer')
const { startOfDay, endOfDay, subDays, parseISO, isValid, format } = require('date-fns')
const { getAdminDb } = require('./firebaseAdmin')
const env = require('../config/env')

function parseDateInput(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = parseISO(raw)
  return isValid(parsed) ? parsed : null
}

function resolveDateRange(payload) {
  const now = new Date()
  const preset = String(payload?.rangePreset || 'week').trim()
  if (preset === 'day') {
    const date = parseDateInput(payload?.date) || now
    return { start: startOfDay(date), end: endOfDay(date), label: `Diario ${format(date, 'yyyy-MM-dd')}` }
  }
  if (preset === 'month') {
    const end = endOfDay(now)
    const start = startOfDay(subDays(end, 29))
    return { start, end, label: `Mensual ${format(start, 'yyyy-MM-dd')} a ${format(end, 'yyyy-MM-dd')}` }
  }
  if (preset === 'custom') {
    const startInput = parseDateInput(payload?.startDate)
    const endInput = parseDateInput(payload?.endDate)
    const start = startOfDay(startInput || subDays(now, 6))
    const end = endOfDay(endInput || now)
    return { start, end, label: `Rango ${format(start, 'yyyy-MM-dd')} a ${format(end, 'yyyy-MM-dd')}` }
  }
  const end = endOfDay(now)
  const start = startOfDay(subDays(end, 6))
  return { start, end, label: `Semanal ${format(start, 'yyyy-MM-dd')} a ${format(end, 'yyyy-MM-dd')}` }
}

function toMs(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  const maybeDate = new Date(value)
  const t = maybeDate.getTime()
  return Number.isFinite(t) ? t : 0
}

function interestAmount(loan) {
  const amount = Math.max(0, Number(loan.amount || 0))
  const interestValue = Math.max(0, Number(loan.interestValue || 0))
  if (loan.interestType === 'fixed') {
    if (loan.interestPerInstallment && loan.paymentType === 'installments') {
      return interestValue * Math.max(1, Number(loan.installmentsCount || 1))
    }
    return interestValue
  }
  const baseInterest = amount * (interestValue / 100)
  if (loan.interestPerInstallment && loan.paymentType === 'installments') {
    return baseInterest * Math.max(1, Number(loan.installmentsCount || 1))
  }
  return baseInterest
}

function totalToRepay(loan) {
  return Math.max(0, Number(loan.amount || 0) + interestAmount(loan))
}

function buildPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).text('MatuCash - Copia de seguridad')
    doc.moveDown(0.3)
    doc.fontSize(10).fillColor('#666').text(`Generado: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`)
    doc.text(`Periodo: ${report.rangeLabel}`)
    doc.text(`Usuario: ${report.uid}`)
    doc.fillColor('black')

    doc.moveDown()
    doc.fontSize(14).text('Resumen')
    doc.fontSize(10)
    doc.text(`Clientes en informe: ${report.summary.clients}`)
    doc.text(`Prestamos en informe: ${report.summary.loans}`)
    doc.text(`Prestamos en mora: ${report.summary.overdueLoans}`)
    doc.text(`Deuda activa total: COP ${Math.round(report.summary.activeDebt).toLocaleString('es-CO')}`)
    doc.text(`Gestiones/llamadas registradas: ${report.summary.calls}`)

    doc.moveDown()
    doc.fontSize(14).text('Clientes')
    doc.fontSize(10)
    for (const c of report.clients.slice(0, 250)) {
      const debt = Math.round(c.activeDebt || 0).toLocaleString('es-CO')
      doc.text(`- ${c.name} | CC ${c.cedula || '-'} | Tel ${c.phone || '-'} | Deuda: COP ${debt}`)
    }

    doc.moveDown()
    doc.fontSize(14).text('Prestamos')
    doc.fontSize(10)
    for (const l of report.loans.slice(0, 350)) {
      const status = l.status || 'in_progress'
      doc.text(
        `- ${l.clientName || 'Cliente'} | Estado: ${status} | Total: COP ${Math.round(l.total).toLocaleString('es-CO')} | Pagado: COP ${Math.round(l.amountPaid).toLocaleString('es-CO')} | Restante: COP ${Math.round(l.remaining).toLocaleString('es-CO')}`
      )
    }

    doc.moveDown()
    doc.fontSize(14).text('Gestiones / Llamadas')
    doc.fontSize(10)
    for (const a of report.calls.slice(0, 250)) {
      doc.text(`- ${a.when} | ${a.action} | ${a.note}`)
    }

    doc.end()
  })
}

async function buildBackupReport(payload) {
  const uid = String(payload?.uid || '').trim()
  if (!uid) throw new Error('uid requerido')

  const includeMode = String(payload?.includeMode || 'all').trim()
  const { start, end, label } = resolveDateRange(payload)
  const startMs = start.getTime()
  const endMs = end.getTime()
  const db = getAdminDb()

  const [clientsSnap, loansSnap, paymentsSnap, auditSnap, runsSnap] = await Promise.all([
    db.collection('users').doc(uid).collection('clients').get(),
    db.collection('users').doc(uid).collection('loans').get(),
    db.collection('users').doc(uid).collection('payments').get(),
    db.collection('users').doc(uid).collection('audit_logs').orderBy('at', 'desc').limit(500).get().catch(() => ({ docs: [] })),
    db.collection('users').doc(uid).collection('backup_runs').get().catch(() => ({ size: 0 }))
  ])

  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const loanRows = loansSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const paymentsByLoan = new Map()
  for (const p of payments) {
    const atMs = toMs(p.at)
    if (atMs < startMs || atMs > endMs) continue
    const key = String(p.loanId || '')
    paymentsByLoan.set(key, (paymentsByLoan.get(key) || 0) + Number(p.amount || 0))
  }

  const formattedLoans = loanRows.map((loan) => {
    const total = totalToRepay(loan)
    const amountPaid = Number(loan.amountPaid || 0)
    const remaining = Math.max(0, total - amountPaid)
    return {
      id: loan.id,
      clientId: String(loan.clientId || ''),
      clientName: String(loan.clientNameSnapshot || ''),
      status: String(loan.status || ''),
      total,
      amountPaid,
      remaining,
      createdAtMs: new Date(String(loan.createdAt || loan.startDate || '')).getTime() || 0
    }
  })

  const debtByClient = new Map()
  for (const loan of formattedLoans) {
    const status = loan.status === 'paid' || loan.remaining <= 0.01 ? 'paid' : loan.status
    if (status === 'paid') continue
    debtByClient.set(loan.clientId, (debtByClient.get(loan.clientId) || 0) + loan.remaining)
  }

  const filteredClients = clients
    .map((c) => ({
      id: c.id,
      name: String(c.name || ''),
      phone: String(c.phone || ''),
      cedula: String(c.cedula || ''),
      activeDebt: Number(debtByClient.get(c.id) || 0)
    }))
    .filter((c) => includeMode === 'debtors' ? c.activeDebt > 0.01 : true)

  const allowedClientIds = new Set(filteredClients.map((c) => c.id))
  const filteredLoans = formattedLoans.filter((l) => {
    if (!allowedClientIds.has(l.clientId)) return false
    if (includeMode === 'overdue') return l.status === 'overdue'
    if (includeMode === 'approved') return l.status === 'in_progress' || l.status === 'paid' || l.status === 'overdue'
    return true
  })

  const calls = (auditSnap.docs || [])
    .map((d) => ({ id: d.id, ...d.data() }))
    .map((x) => {
      const atMs = toMs(x.at)
      return {
        atMs,
        action: String(x.action || 'evento'),
        note: JSON.stringify(x.payload || {}).slice(0, 150)
      }
    })
    .filter((x) => x.atMs >= startMs && x.atMs <= endMs)
    .map((x) => ({
      when: format(new Date(x.atMs), 'yyyy-MM-dd HH:mm'),
      action: x.action,
      note: x.note || '-'
    }))

  const activeDebt = filteredLoans.reduce((acc, l) => acc + (l.remaining > 0 ? l.remaining : 0), 0)
  const overdueLoans = filteredLoans.filter((l) => l.status === 'overdue' && l.remaining > 0.01).length

  const report = {
    uid,
    rangeLabel: label,
    summary: {
      clients: filteredClients.length,
      loans: filteredLoans.length,
      overdueLoans,
      activeDebt,
      calls: calls.length,
      backupsCount: Number(runsSnap.size || 0)
    },
    clients: filteredClients,
    loans: filteredLoans,
    calls
  }

  const pdfBuffer = await buildPdfBuffer(report)
  return { report, pdfBuffer, rangeStartIso: format(start, 'yyyy-MM-dd'), rangeEndIso: format(end, 'yyyy-MM-dd') }
}

function createTransporter() {
  if (!env.backupMailerUser || !env.backupMailerPass || !env.backupMailerFrom) {
    throw new Error('Configura BACKUP_MAILER_USER, BACKUP_MAILER_PASS y BACKUP_MAILER_FROM')
  }
  return nodemailer.createTransport({
    host: env.backupMailerHost,
    port: env.backupMailerPort,
    secure: env.backupMailerSecure,
    auth: {
      user: env.backupMailerUser,
      pass: env.backupMailerPass
    }
  })
}

async function sendBackupByEmail(payload) {
  const to = String(payload?.email || '').trim()
  if (!to) throw new Error('email requerido')
  const { report, pdfBuffer, rangeStartIso, rangeEndIso } = await buildBackupReport(payload)
  const transport = createTransporter()
  const fileName = `matucash-backup-${report.uid}-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`
  await transport.sendMail({
    from: env.backupMailerFrom,
    to,
    subject: `Copia de seguridad MatuCash (${report.rangeLabel})`,
    replyTo: env.backupMailerFrom,
    priority: 'high',
    headers: {
      'X-Priority': '1',
      Importance: 'high',
      'X-MSMail-Priority': 'High'
    },
    text:
      `Copia de seguridad MatuCash\n\n` +
      `Periodo: ${report.rangeLabel}\n` +
      `Clientes: ${report.summary.clients}\n` +
      `Prestamos: ${report.summary.loans}\n` +
      `Prestamos en mora: ${report.summary.overdueLoans}\n` +
      `Deuda activa total: COP ${Math.round(report.summary.activeDebt).toLocaleString('es-CO')}\n\n` +
      `Adjunto va el PDF del respaldo.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111;">
        <h2 style="margin-bottom: 8px;">Copia de seguridad MatuCash</h2>
        <p>Rango: <strong>${report.rangeLabel}</strong></p>
        <p>Clientes: <strong>${report.summary.clients}</strong> | Préstamos: <strong>${report.summary.loans}</strong> | Mora: <strong>${report.summary.overdueLoans}</strong></p>
        <p>Deuda activa total: <strong>COP ${Math.round(report.summary.activeDebt).toLocaleString('es-CO')}</strong></p>
        <p>Adjunto encontrarás el PDF completo del respaldo.</p>
      </div>
    `,
    attachments: [
      {
        filename: fileName,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  })

  const db = getAdminDb()
  await db.collection('users').doc(report.uid).collection('backup_runs').add({
    email: to,
    rangeStartIso,
    rangeEndIso,
    rangeLabel: report.rangeLabel,
    includeMode: String(payload?.includeMode || 'all'),
    summary: report.summary,
    createdAt: new Date()
  })

  const snap = await db.collection('users').doc(report.uid).collection('backup_runs').get()
  return { report, backupsCount: snap.size }
}

async function getBackupStats(uid) {
  const userId = String(uid || '').trim()
  if (!userId) throw new Error('uid requerido')
  const db = getAdminDb()
  const snap = await db.collection('users').doc(userId).collection('backup_runs').orderBy('createdAt', 'desc').limit(1).get().catch(() => ({ docs: [] }))
  const countSnap = await db.collection('users').doc(userId).collection('backup_runs').get()
  const latest = snap.docs?.[0]
  return {
    backupsCount: countSnap.size || 0,
    lastBackupAtMs: latest ? toMs(latest.data().createdAt) : 0,
    lastBackupEmail: latest ? String(latest.data().email || '') : ''
  }
}

module.exports = {
  sendBackupByEmail,
  getBackupStats
}
