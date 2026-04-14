function money(value, currency = 'COP') {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(Number(value || 0))
  } catch {
    return `$${Number(value || 0)}`
  }
}

function loanCreatedTemplate(payload) {
  const {
    clientName = 'Cliente',
    amount,
    total,
    dueDate,
    loanId,
    ticketUrl
  } = payload
  return [
    `Hola ${clientName} 👋`,
    '',
    '✅ *Tu préstamo fue registrado con éxito*',
    '',
    `💵 *Monto prestado:* ${money(amount)}`,
    `🧾 *Total a pagar:* ${money(total)}`,
    `📅 *Fecha límite:* ${dueDate}`,
    `🔐 *Referencia:* ${loanId}`,
    '',
    '⏰ Recuerda hacer tu pago a tiempo para evitar mora.',
    ticketUrl ? `🔗 Ticket digital: ${ticketUrl}` : null
  ].filter(Boolean).join('\n')
}

function paymentTemplate(payload) {
  const { clientName = 'Cliente', paymentAmount, remaining, loanId } = payload
  return [
    `Hola ${clientName} 👋`,
    '',
    '✅ *Recibimos tu abono correctamente*',
    '',
    `💸 *Abono recibido:* ${money(paymentAmount)}`,
    `📉 *Saldo pendiente:* ${money(remaining)}`,
    `🔐 *Referencia:* ${loanId}`,
    '',
    remaining <= 0
      ? '🎉 Tu préstamo quedó *liquidado*. Gracias por cumplir.'
      : '🙏 Gracias. Recuerda continuar con tus próximos pagos.'
  ].join('\n')
}

function overdueTemplate(payload) {
  const { clientName = 'Cliente', overdueDays = 1, remaining, dueDate, loanId } = payload
  return [
    `Hola ${clientName} 👋`,
    '',
    '⚠️ *Tu préstamo presenta mora*',
    '',
    `📆 *Días de atraso:* ${overdueDays}`,
    `💰 *Saldo pendiente:* ${money(remaining)}`,
    `🗓️ *Vencía el:* ${dueDate}`,
    `🔐 *Referencia:* ${loanId}`,
    '',
    '🚨 Por favor realiza tu pago lo antes posible para evitar recargos.'
  ].join('\n')
}

module.exports = {
  loanCreatedTemplate,
  paymentTemplate,
  overdueTemplate
}
