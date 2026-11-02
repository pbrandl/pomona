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
  } else if (r.role === 'organizer') {
    if (r.phase === 'bidding') {
      title = `${fmt(r.progress * 100, 0)} % vom Ziel erreicht`
      sub = `Bieten möglich bis ${esc(dayTime(r.biddingEnd))}.`
    } else if (r.phase === 'running' && r.canInvoice) {
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
  } else if (r.phase === 'bidding') {
    if (pledge > 0) {
      tone = 'ok'
      title = `Du bietest ${fmt(r.myPledge)} ${sym} ${p.per}`
      sub = `${fmt(r.myDeposit)} ${sym} liegen im Treuhandkonto. Änderbar bis ${esc(dayTime(r.biddingEnd))}.`
      actions = `<button class="btn ghost" data-action="start-bid">Erhöhen</button>${link(ui, 'withdraw', ui.pending === 'withdraw' ? 'Wird zurückgezogen…' : 'Zurückziehen')}`
    } else if (num(s.wallet.usdt) <= 0) {
      tone = 'act'
      title = 'Lade dein Konto auf'
      sub = 'Dann kannst du mitbieten. Bezahlt wird in USDT.'
      actions = '<button class="btn accent" data-action="open-fund">Aufladen</button>'
    } else {
      tone = 'act'
      title = 'Mitbieten'
      sub = r.guide ? `Richtwert ${fmt(r.guide)} ${sym} ${p.per}. Gib, was du kannst.` : `Dein Betrag ${p.per}, ${r.installments} Raten.`
      actions = '<button class="btn accent" data-action="start-bid">Gebot abgeben</button>'
    }
  } else if (pledge > 0) {
    tone = 'ok'
    const paid = (r.invoices || []).filter((x) => x.status === 'paid' && x.mine)
    title = `Du bist dabei: ${fmt(r.myPledge)} ${sym} ${p.per}`
    sub = r.phase === 'running'
      ? `${paid.length} von ${r.installments} Raten bezahlt. Nächste ab ${esc(date(r.nextInvoiceAt))}.`
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
