/**
 * "Du": the one card that answers "Wo stehe ich, und was ist jetzt zu tun?"
 * with exactly one primary action. Replaces a separate status banner, bid
 * card, refund card and invoice button, which repeated each other.
 * @module ui/views/you
 */
import { esc, fmt, num, per, date, dayTime } from '../format.js'
import { btn, link } from './parts.js'

export function youCard (ui) {
  const s = ui.status
  const r = s.round
  const p = per(r.intervalName)
  const sym = esc(r.symbol)
  const pledge = num(r.myPledge)
  let title = ''
  let sub = ''
  let actions = ''
  let tone = ''

  if (num(r.refundable) > 0) {
    tone = 'act'
    title = `${fmt(r.refundable)} ${sym} warten auf dich`
    sub = r.phase === 'failed' ? 'Das Ziel wurde nicht erreicht.' : 'Diese Raten werden nicht mehr abgerechnet.'
    actions = btn(ui, 'refund', 'Zurückholen', 'accent', { busy: 'Wird überwiesen…' })
  } else if (r.phase === 'bidding') {
    return yourBid(ui, r, p) // everyone with a wallet can bid, the organizer too
  } else if (pledge > 0 && r.openInvoices > 0) {
    tone = 'act'
    const open = r.invoices.filter((x) => x.status === 'open')
    title = open.length === 1 ? `Rechnung ${open[0].index + 1}: ${fmt(r.openAmount)} ${sym}` : `${open.length} offene Rechnungen: ${fmt(r.openAmount)} ${sym}`
    const lacking = num(s.wallet.usdt) < num(r.openAmount)
    sub = lacking
      ? `Dir fehlen ${fmt(num(r.openAmount) - num(s.wallet.usdt))} ${sym}. Lade dein Konto auf, dann bezahlst du und bekommst den Beleg.`
      : 'Bezahlen und Beleg erhalten. Der Betrag geht direkt an den Organisator.'
    actions = lacking
      ? '<button class="btn accent" data-action="open-fund">Aufladen</button>'
      : '<button class="btn accent" data-action="open-pay">Bezahlen</button>'
  } else if (r.role === 'organizer' && r.mode === 'invoice' && (r.phase === 'running' || r.phase === 'completed')) {
    const last = (r.invoices || []).filter((x) => x.status === 'issued').at(-1)
    title = last ? `Rechnung ${last.index + 1}: ${last.paidCount} von ${r.bidders} bezahlt` : 'Ratenzahlung läuft'
    sub = r.phase === 'running' && r.invoiceCount < r.installments
      ? `Rechnungen gehen automatisch raus. Nächste am ${esc(date(r.nextInvoiceAt))}.`
      : `Alle ${r.installments} Rechnungen sind verschickt.`
    if (last) actions = `<button class="btn ghost" data-action="show-invoice" data-index="${last.index}">Wer hat bezahlt?</button>`
  } else if (r.role === 'organizer') {
    if (r.phase === 'running' && r.canInvoice) {
      tone = 'act'
      title = `Rechnung ${r.invoiceCount + 1} ist fällig`
      sub = `${fmt(r.total)} ${sym} gehen an dein Konto. Alle Bietenden bekommen einen Beleg.`
      actions = btn(ui, 'invoice', 'Rechnung stellen', 'accent', { busy: 'Wird abgerechnet…' })
    } else if (r.phase === 'running') {
      title = `Nächste Rechnung ab ${esc(date(r.nextInvoiceAt))}`
      sub = `${r.invoiceCount} von ${r.installments} Raten abgerechnet.`
    } else if (r.phase === 'completed') {
      title = 'Runde abgeschlossen'
      sub = `${r.invoiceCount} von ${r.installments} Raten abgerechnet.`
    } else {
      title = 'Ziel nicht erreicht'
      sub = 'Die Bietenden holen ihr Geld zurück.'
    }
  } else if (pledge > 0) {
    tone = 'ok'
    const paid = (r.invoices || []).filter((x) => x.status === 'paid' && x.mine)
    title = `Du bist dabei: ${fmt(r.myPledge)} ${sym} ${p.per}`
    const nextText = r.mode === 'invoice' ? `Nächste Rechnung am ${esc(date(r.nextInvoiceAt))}.` : `Nächste ab ${esc(date(r.nextInvoiceAt))}.`
    sub = r.phase === 'running' && r.invoiceCount < r.installments
      ? `${paid.length} von ${r.installments} Raten bezahlt. ${nextText}`
      : `${paid.length} ${paid.length === 1 ? 'Rate' : 'Raten'} bezahlt.`
    if (paid.length) actions = `<button class="btn ghost" data-action="show-receipt" data-index="${paid.at(-1).index}">Letzten Beleg zeigen</button>`
  } else {
    title = r.phase === 'failed' ? 'Ziel nicht erreicht' : 'Du hast nicht geboten'
    sub = r.phase === 'failed' ? 'Es gibt keine Raten.' : 'Die Bietphase ist vorbei.'
  }

  return `<div class="you ${tone}" role="status">
    <div><p class="you-title">${title}</p>${sub ? `<p class="small muted">${sub}</p>` : ''}</div>
    ${actions ? `<div class="you-actions">${actions}</div>` : ''}
  </div>`
}

/**
 * "Dein Gebot": the bid in the currency and one button that starts the
 * three-step bid flow (Betrag → Prüfen → Fertig). Same on desktop and mobile.
 */
function yourBid (ui, r, p) {
  const sym = esc(r.symbol)
  const pledge = num(r.myPledge)
  const payg = r.mode === 'invoice'
  const note = pledge > 0
    ? (payg ? `Bezahlt wird mit jeder Rechnung. Änderbar bis ${esc(dayTime(r.biddingEnd))}.` : `${fmt(r.myDeposit)} ${sym} liegen im Treuhandkonto. Änderbar bis ${esc(dayTime(r.biddingEnd))}.`)
    : r.guide ? `Richtwert ${fmt(r.guide)} ${sym} ${p.per}. Gib, was du kannst.` : `${r.installments} Raten, ${esc(p.adj)}.`
  return `<div class="you bid-box ${pledge > 0 ? 'ok' : 'act'}" role="status">
    <div class="bid-box-main">
      <p class="small muted bid-box-label">Dein Gebot</p>
      <p class="bid-box-amount"><strong class="${pledge > 0 ? '' : 'none'}">${fmt(pledge)}</strong> ${sym} <span>${p.per}</span></p>
      <p class="small muted">${note}</p>
    </div>
    <div class="you-actions">
      <button class="btn accent" data-action="start-bid">${pledge > 0 ? 'Erhöhen' : 'Bieten'}</button>
      ${pledge > 0 ? link(ui, 'withdraw', ui.pending === 'withdraw' ? 'Wird zurückgezogen…' : 'Zurückziehen') : ''}
    </div>
  </div>`
}
