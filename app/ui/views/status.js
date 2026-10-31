/**
 * "Wo stehe ich?": one line at the top of the round that answers what matters
 * for me right now, with the one action that fits.
 * @module ui/views/status
 */
import { esc, fmt, num, per, date, dayTime, left } from '../format.js'

/**
 * @param {object} ui
 * @returns {string} HTML
 */
export function statusLine (ui) {
  const s = ui.status
  const r = s.round
  const p = per(r.intervalName)
  const pledge = num(r.myPledge)
  const balance = num(s.wallet.usdt)
  const t = left(r.biddingEnd, r.now)
  let tone = 'info'
  let text = ''
  let action = ''

  if (num(r.refundable) > 0) {
    tone = 'act'
    text = `<strong>${fmt(r.refundable)} ${esc(r.symbol)}</strong> warten auf dich.`
    action = '<button class="btn accent small" data-action="refund">Zurückholen</button>'
  } else if (r.role === 'organizer') {
    if (r.phase === 'bidding') {
      text = `<strong>${r.bidders} ${r.bidders === 1 ? 'Gebot' : 'Gebote'}</strong> · ${fmt(r.progress * 100, 0)} % vom Ziel · noch ${esc(t.value)} ${esc(t.unit.replace(' übrig', ''))}`
      action = '<button class="btn ghost small" data-action="copy-invite">Link kopieren</button>'
    } else if (r.phase === 'running' && r.canInvoice) {
      tone = 'act'
      text = `<strong>Rechnung ${r.invoiceCount + 1}</strong> ist fällig · ${fmt(r.total)} ${esc(r.symbol)}`
      action = '<button class="btn accent small" data-action="invoice">Jetzt stellen</button>'
    } else if (r.phase === 'running') {
      text = `${r.invoiceCount} von ${r.installments} Rechnungen gestellt · nächste ab <strong>${esc(date(r.nextInvoiceAt))}</strong>`
    } else if (r.phase === 'completed') {
      text = `Abgeschlossen · ${r.invoiceCount} von ${r.installments} Rechnungen gestellt`
    } else {
      tone = 'warn'
      text = 'Ziel nicht erreicht. Die Bietenden holen ihr Geld zurück.'
    }
  } else if (r.phase === 'bidding') {
    if (pledge > 0) {
      tone = 'ok'
      text = `Du bietest <strong>${fmt(r.myPledge)} ${esc(r.symbol)} ${p.per}</strong> · änderbar bis ${esc(dayTime(r.biddingEnd))}`
    } else if (balance <= 0) {
      tone = 'act'
      text = 'Lade dein Konto mit USDT auf, um mitzubieten.'
      action = '<button class="btn accent small" data-action="open-fund">Aufladen</button>'
    } else {
      tone = 'act'
      text = `Du hast noch nicht geboten · noch ${esc(t.value)} ${esc(t.unit.replace(' übrig', ''))}`
      action = '<button class="btn accent small" data-action="focus-bid">Jetzt bieten</button>'
    }
  } else if (r.phase === 'running' && pledge > 0) {
    tone = 'ok'
    text = `${r.invoiceCount} von ${r.installments} Raten bezahlt · nächste ab <strong>${esc(date(r.nextInvoiceAt))}</strong>`
  } else if (r.phase === 'completed' && pledge > 0) {
    tone = 'ok'
    text = `Abgeschlossen · ${r.invoiceCount} ${r.invoiceCount === 1 ? 'Beleg' : 'Belege'} in deinen Raten`
  } else if (r.phase === 'failed') {
    tone = 'warn'
    text = 'Das Ziel wurde nicht erreicht.'
  } else {
    text = 'Du hast in dieser Runde nicht geboten.'
  }

  return `<div class="status-line ${tone}" role="status"><p>${text}</p>${action}</div>`
}
