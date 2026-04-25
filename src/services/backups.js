const PDFDocument = require('pdfkit')
const nodemailer = require('nodemailer')
const { startOfDay, endOfDay, subDays, parseISO, isValid, format } = require('date-fns')
const fs = require('fs')
const path = require('path')
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

function formatCop(value) {
  return `COP ${Math.round(Number(value || 0)).toLocaleString('es-CO')}`
}

function paymentStatusLabel(status, remaining) {
  if (remaining <= 0.01 || status === 'paid') return 'Pagado'
  if (status === 'overdue') return 'En mora'
  return 'Al día'
}

function actionLabel(action) {
  const map = {
    'payment.created': 'Abono registrado',
    'payment.updated': 'Abono editado',
    'payment.cancelled': 'Abono cancelado',
    'loan.updated': 'Préstamo actualizado'
  }
  return map[String(action || '')] || 'Gestión registrada'
}

function actionNote(action, payload) {
  const data = payload && typeof payload === 'object' ? payload : {}
  if (action === 'payment.created') {
    return `Abono de ${formatCop(data.paymentAmount)} aplicado al préstamo.`
  }
  if (action === 'payment.updated') {
    return `Abono corregido de ${formatCop(data.beforeAmount)} a ${formatCop(data.afterAmount)}${data.reason ? `. Motivo: ${String(data.reason)}` : '.'}`
  }
  if (action === 'payment.cancelled') {
    return `Se anuló el abono de ${formatCop(data.cancelledAmount)}.${data.reason ? ` Motivo: ${String(data.reason)}` : ''}`
  }
  if (action === 'loan.updated') {
    return `Se actualizaron condiciones del préstamo.${data.reason ? ` Motivo: ${String(data.reason)}` : ''}`
  }
  return 'Actividad de gestión registrada en el sistema.'
}

function safeLogoPath() {
  const fromEnv = String(process.env.BACKUP_BRAND_LOGO_PATH || '').trim()
  const candidate = fromEnv || path.resolve(__dirname, '../../../MatuCash/public/logo-app.png')
  return fs.existsSync(candidate) ? candidate : ''
}

function drawHeader(doc, report) {
  const pageWidth = doc.page.width
  const margin = doc.page.margins.left
  const contentWidth = pageWidth - (margin * 2)
  doc.save()
  doc.rect(margin, 34, contentWidth, 88).fill('#0F172A')
  doc.restore()

  const logoPath = safeLogoPath()
  if (logoPath) {
    doc.image(logoPath, margin + 14, 46, { fit: [54, 54] })
  }

  doc.fillColor('#E2E8F0').fontSize(20).text('Informe Gerencial de Respaldo', margin + 78, 50)
  doc.fillColor('#94A3B8').fontSize(11).text('Generado por MatuCash', margin + 78, 76)
  doc.fillColor('#CBD5E1').fontSize(10).text(`Periodo: ${report.rangeLabel}`, margin + 78, 92)
  doc.fillColor('#CBD5E1').fontSize(10).text(`Usuario: ${report.ownerName}`, margin + 320, 92, { width: 220, align: 'right' })
  doc.moveDown(4.8)
}

function ensurePageSpace(doc, neededHeight) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom
  if (doc.y + neededHeight <= bottomLimit) return
  doc.addPage()
  drawWatermark(doc)
}

function drawWatermark(doc) {
  doc.save()
  doc.rotate(-35, { origin: [300, 390] })
  doc.fillOpacity(0.06).fontSize(56).fillColor('#0F172A').text('MatuCash', 120, 350, { width: 400, align: 'center' })
  doc.restore()
  doc.fillOpacity(1).fillColor('black')
}

function drawSectionTitle(doc, title) {
  ensurePageSpace(doc, 28)
  doc.moveDown(0.8)
  doc.fontSize(13).fillColor('#0F172A').text(title, { underline: false })
  doc.moveDown(0.4)
}

function drawKpiGrid(doc, kpis) {
  const startX = doc.page.margins.left
  const cardW = (doc.page.width - (doc.page.margins.left * 2) - 18) / 2
  const cardH = 56
  let x = startX
  let y = doc.y
  kpis.forEach((item, idx) => {
    ensurePageSpace(doc, cardH + 8)
    if (idx % 2 === 0 && idx > 0) {
      x = startX
      y += cardH + 8
    } else if (idx % 2 === 1) {
      x = startX + cardW + 18
    }
    doc.save()
    doc.roundedRect(x, y, cardW, cardH, 8).fill('#F8FAFC')
    doc.restore()
    doc.fontSize(9).fillColor('#64748B').text(item.label, x + 10, y + 10, { width: cardW - 20 })
    doc.fontSize(14).fillColor('#0F172A').text(item.value, x + 10, y + 25, { width: cardW - 20 })
  })
  doc.y = y + cardH + 4
}

function drawTable(doc, opts) {
  const { title, columns, rows, emptyMessage } = opts
  drawSectionTitle(doc, title)
  const startX = doc.page.margins.left
  const totalW = doc.page.width - (doc.page.margins.left * 2)
  const colWidths = columns.map((c) => Math.floor(totalW * c.width))
  const rowPaddingY = 7

  if (!rows.length) {
    doc.fontSize(10).fillColor('#64748B').text(emptyMessage || 'Sin datos para este periodo.')
    return
  }

  ensurePageSpace(doc, 28)
  let y = doc.y
  doc.save()
  doc.rect(startX, y, totalW, 24).fill('#0F172A')
  doc.restore()
  let x = startX
  columns.forEach((col, idx) => {
    doc.fontSize(9).fillColor('#E2E8F0').text(col.label, x + 6, y + 8, { width: colWidths[idx] - 12, align: col.align || 'left' })
    x += colWidths[idx]
  })
  y += 24

  rows.forEach((row, idx) => {
    const rowHeight = Math.max(
      26,
      ...columns.map((col, colIdx) =>
        doc.heightOfString(String(row[col.key] ?? ''), { width: colWidths[colIdx] - 12 })
      )
    ) + rowPaddingY
    ensurePageSpace(doc, rowHeight + 2)
    doc.save()
    doc.rect(startX, y, totalW, rowHeight).fill(idx % 2 === 0 ? '#F8FAFC' : '#EEF2F7')
    doc.restore()
    let cellX = startX
    columns.forEach((col, colIdx) => {
      doc.fontSize(9).fillColor('#0F172A').text(String(row[col.key] ?? ''), cellX + 6, y + 7, {
        width: colWidths[colIdx] - 12,
        align: col.align || 'left'
      })
      cellX += colWidths[colIdx]
    })
    y += rowHeight
  })

  doc.y = y + 4
}

function buildPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    drawWatermark(doc)
    drawHeader(doc, report)
    drawSectionTitle(doc, 'Resumen ejecutivo')
    drawKpiGrid(doc, [
      { label: 'Clientes en seguimiento', value: String(report.summary.clients) },
      { label: 'Préstamos analizados', value: String(report.summary.loans) },
      { label: 'Préstamos en mora', value: String(report.summary.overdueLoans) },
      { label: 'Deuda activa total', value: formatCop(report.summary.activeDebt) },
      { label: 'Abonos del periodo', value: formatCop(report.summary.paymentsInRange) },
      { label: 'Respaldos realizados', value: String(report.summary.backupsCount + 1) }
    ])

    drawTable(doc, {
      title: 'Clientes',
      columns: [
        { key: 'name', label: 'Cliente', width: 0.30 },
        { key: 'cedula', label: 'Cédula', width: 0.18 },
        { key: 'phone', label: 'Teléfono', width: 0.18 },
        { key: 'activeDebt', label: 'Deuda actual', width: 0.18, align: 'right' },
        { key: 'paymentsInRange', label: 'Abonos periodo', width: 0.16, align: 'right' }
      ],
      rows: report.clients.slice(0, 250).map((c) => ({
        ...c,
        activeDebt: formatCop(c.activeDebt),
        paymentsInRange: formatCop(c.paymentsInRange)
      })),
      emptyMessage: 'No hay clientes para el filtro seleccionado.'
    })

    drawTable(doc, {
      title: 'Préstamos',
      columns: [
        { key: 'clientName', label: 'Cliente', width: 0.23 },
        { key: 'statusLabel', label: 'Estado', width: 0.13 },
        { key: 'total', label: 'Total', width: 0.16, align: 'right' },
        { key: 'amountPaid', label: 'Abonado', width: 0.16, align: 'right' },
        { key: 'remaining', label: 'Pendiente', width: 0.16, align: 'right' },
        { key: 'startDate', label: 'Inicio', width: 0.16, align: 'right' }
      ],
      rows: report.loans.slice(0, 350).map((l) => ({
        ...l,
        total: formatCop(l.total),
        amountPaid: formatCop(l.amountPaid),
        remaining: formatCop(l.remaining)
      })),
      emptyMessage: 'No hay préstamos para el filtro seleccionado.'
    })

    drawTable(doc, {
      title: 'Gestiones y llamadas del periodo',
      columns: [
        { key: 'when', label: 'Fecha', width: 0.18 },
        { key: 'action', label: 'Gestión', width: 0.25 },
        { key: 'note', label: 'Detalle', width: 0.57 }
      ],
      rows: report.calls.slice(0, 250),
      emptyMessage: 'No hay gestiones registradas en el periodo.'
    })

    doc.moveDown(0.8)
    doc.fontSize(8).fillColor('#64748B').text('Documento generado automáticamente por MatuCash. Uso gerencial interno.', {
      align: 'center'
    })

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

  const [userSnap, clientsSnap, loansSnap, paymentsSnap, auditSnap, runsSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
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
  const paymentsByClient = new Map()
  for (const loan of formattedLoans) {
    const status = loan.status === 'paid' || loan.remaining <= 0.01 ? 'paid' : loan.status
    if (status === 'paid') continue
    debtByClient.set(loan.clientId, (debtByClient.get(loan.clientId) || 0) + loan.remaining)
  }
  for (const loan of formattedLoans) {
    const loanPayments = Number(paymentsByLoan.get(loan.id) || 0)
    if (loanPayments <= 0) continue
    paymentsByClient.set(loan.clientId, (paymentsByClient.get(loan.clientId) || 0) + loanPayments)
  }

  const filteredClients = clients
    .map((c) => ({
      id: c.id,
      name: String(c.name || ''),
      phone: String(c.phone || ''),
      cedula: String(c.cedula || ''),
      activeDebt: Number(debtByClient.get(c.id) || 0),
      paymentsInRange: Number(paymentsByClient.get(c.id) || 0)
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
        actionRaw: String(x.action || 'evento'),
        payload: x.payload || {}
      }
    })
    .filter((x) => x.atMs >= startMs && x.atMs <= endMs)
    .map((x) => ({
      when: format(new Date(x.atMs), 'dd/MM/yyyy HH:mm'),
      action: actionLabel(x.actionRaw),
      note: actionNote(x.actionRaw, x.payload)
    }))

  const userData = userSnap.exists ? userSnap.data() || {} : {}
  const profile = userData.profile || {}
  const ownerName =
    String(profile.fullName || '').trim() ||
    String(profile.email || '').trim() ||
    String(payload?.email || '').trim() ||
    'Usuario MatuCash'

  const activeDebt = filteredLoans.reduce((acc, l) => acc + (l.remaining > 0 ? l.remaining : 0), 0)
  const overdueLoans = filteredLoans.filter((l) => l.status === 'overdue' && l.remaining > 0.01).length
  const paymentsInRange = Array.from(paymentsByLoan.values()).reduce((acc, x) => acc + Number(x || 0), 0)

  const report = {
    uid,
    ownerName,
    rangeLabel: label,
    summary: {
      clients: filteredClients.length,
      loans: filteredLoans.length,
      overdueLoans,
      activeDebt,
      calls: calls.length,
      paymentsInRange,
      backupsCount: Number(runsSnap.size || 0)
    },
    clients: filteredClients,
    loans: filteredLoans.map((l) => ({
      ...l,
      statusLabel: paymentStatusLabel(l.status, l.remaining),
      startDate: l.createdAtMs ? format(new Date(l.createdAtMs), 'dd/MM/yyyy') : '-'
    })),
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
  const fileName = `matucash-backup-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`
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
        <p>Usuario: <strong>${report.ownerName}</strong></p>
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
