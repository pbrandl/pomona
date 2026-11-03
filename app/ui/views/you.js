/**
 * "Du": the one card that answers "Wo stehe ich, und was ist jetzt zu tun?"
 * with exactly one primary action. Replaces a separate status banner, bid
 * card, refund card and invoice button, which repeated each other.
 * @module ui/views/you
 */
import { esc, fmt, num, per, date, dayTime } from '../format.js'
import { btn, link } from './parts.js'

/**
 * @param {object} ui
 * @param {{ asBidder?: boolean }} [o] - asBidder: the organizer's own bid page
 *   ("Bietseite"); otherwise the organizer gets the project view
 */
export function youCard (ui, { asBidder = false } = {}) {
  const r = ui.status.round
  return r.role === 'organizer' && !asBidder ? projectCard(ui, r) : bidderCard(ui, r)
}

/** Your own part in the round: everyone with a bid, the organizer on their bid page too. */
function bidderCard (ui, r) {
  const s = ui.status
  const p = per(r.intervalName)
  const sym = esc(r.symbol)
  const pledge = num(r.myPledge)
  const mine = r.myInvoices || []
  if (num(r.refundable) > 0) {
    return card('act', `${fmt(r.refundable)} ${sym} warten auf dich`,
      r.phase === 'failed' ? 'Das Ziel wurde nicht erreicht.' : 'Diese Raten werden nicht mehr abgerechnet.',
      btn(ui, 'refund', 'Zurückholen', 'accent', { busy: 'Wird überwiesen…' }))
  }
  if (r.phase === 'bidding') return yourBid(ui, r, p)
  if (pledge > 0 && r.openInvoices > 0) {
    const open = mine.filter((x) => x.status === 'open')
    const self = r.role === 'organizer' // own bid: only recorded, nothing is transferred
    const lacking = !self && num(s.wallet.usdt) < num(r.openAmount)
    return card('act',
      open.length === 1 ? `Rechnung ${open[0].index + 1}: ${fmt(r.openAmount)} ${sym}` : `${open.length} offene Rechnungen: ${fmt(r.openAmount)} ${sym}`,
      self
        ? 'Dein eigenes Gebot: Es wird nichts überwiesen, nur als bezahlt vermerkt. Dafür gibt es den Beleg.'
        : lacking
          ? `Dir fehlen ${fmt(num(r.openAmount) - num(s.wallet.usdt))} ${sym}. Lade dein Konto auf, dann bezahlst du und bekommst den Beleg.`
          : 'Bezahlen und Beleg erhalten. Der Betrag geht direkt an den Organisator.',
      lacking ? '<button class="btn accent" data-action="open-fund">Aufladen</button>' : `<button class="btn accent" data-action="open-pay">${self ? 'Als bezahlt vermerken' : 'Bezahlen'}</button>`)
  }
  if (pledge > 0) {
    const paid = mine.filter((x) => x.status === 'paid')
    const nextText = r.mode === 'invoice' ? `Nächste Rechnung am ${esc(date(r.nextInvoiceAt))}.` : `Nächste ab ${esc(date(r.nextInvoiceAt))}.`
    return card('ok', `Du bist dabei: ${fmt(r.myPledge)} ${sym} ${p.per}`,
      r.phase === 'running' && r.invoiceCount < r.installments
        ? `${paid.length} von ${r.installments} Raten bezahlt. ${nextText}`
        : `${paid.length} ${paid.length === 1 ? 'Rate' : 'Raten'} bezahlt.`,
      paid.length ? `<button class="btn ghost" data-action="show-receipt" data-index="${paid.at(-1).index}">Letzten Beleg zeigen</button>` : '')
  }
  return card('', r.phase === 'failed' ? 'Ziel nicht erreicht' : 'Du hast nicht geboten', r.phase === 'failed' ? 'Es gibt keine Raten.' : 'Die Bietphase ist vorbei.')
}

/** The organizer's project page: the whole round and what to do for it. Own bids live on the bid page. */
function projectCard (ui, r) {
  const sym = esc(r.symbol)
  if (r.phase === 'bidding') return '' // progress and deadline are in the header and the ring
  if (r.mode === 'invoice' && (r.phase === 'running' || r.phase === 'completed')) {
    const last = (r.invoices || []).filter((x) => x.status === 'issued').at(-1)
    return card('', last ? `Rechnung ${last.index + 1}: ${last.paidCount} von ${r.bidders} bezahlt` : 'Ratenzahlung läuft',
      r.phase === 'running' && r.invoiceCount < r.installments
        ? `Rechnungen gehen automatisch raus. Nächste am ${esc(date(r.nextInvoiceAt))}.`
        : `Alle ${r.installments} Rechnungen sind verschickt.`,
      last ? `<button class="btn ghost" data-action="show-invoice" data-index="${last.index}">Wer hat bezahlt?</button>` : '')
  }
  if (r.phase === 'running' && r.canInvoice) {
    return card('act', `Rechnung ${r.invoiceCount + 1} ist fällig`, `${fmt(r.total)} ${sym} gehen an dein Konto. Alle Bietenden bekommen einen Beleg.`,
      btn(ui, 'invoice', 'Rechnung stellen', 'accent', { busy: 'Wird abgerechnet…' }))
  }
  if (r.phase === 'running') return card('', `Nächste Rechnung ab ${esc(date(r.nextInvoiceAt))}`, `${r.invoiceCount} von ${r.installments} Raten abgerechnet.`)
  if (r.phase === 'completed') return card('', 'Runde abgeschlossen', `${r.invoiceCount} von ${r.installments} Raten abgerechnet.`)
  return card('', 'Ziel nicht erreicht', 'Die Bietenden holen ihr Geld zurück.')
}

function card (tone, title, sub, actions = '') {
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
