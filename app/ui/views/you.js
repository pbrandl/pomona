/**
 * "Du": the one card that answers "Wo stehe ich, und was ist jetzt zu tun?"
 * with exactly one primary action. Replaces a separate status banner, bid
 * card, refund card and invoice button, which repeated each other.
 * @module ui/views/you
 */
import { esc, fmt, num, per, date, dayTime } from '../format.js'
import { btn, link } from './parts.js'
import { t } from '../../i18n/index.js'

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
    return card('act', t('you.waiting', { amount: fmt(r.refundable), symbol: sym }),
      t(r.phase === 'failed' ? 'you.failed' : 'you.notBilled'),
      btn(ui, 'refund', t('you.refund'), 'accent', { busy: t('fund.faucetBusy') }))
  }
  if (r.phase === 'bidding') return yourBid(ui, r, p)
  if (pledge > 0 && r.openInvoices > 0) {
    const open = mine.filter((x) => x.status === 'open')
    const self = r.role === 'organizer' // own bid: only recorded, nothing is transferred
    const lacking = !self && num(s.wallet.usdt) < num(r.openAmount)
    return card('act',
      open.length === 1 ? t('you.invoice', { i: open[0].index + 1, amount: fmt(r.openAmount), symbol: sym }) : t('you.openInvoices', { n: open.length, amount: fmt(r.openAmount), symbol: sym }),
      self
        ? t('you.selfNote')
        : lacking
          ? t('you.lacking', { amount: fmt(num(r.openAmount) - num(s.wallet.usdt)), symbol: sym })
          : t('you.payNote'),
      lacking ? `<button class="btn accent" data-action="open-fund">${t('wallet.fund')}</button>` : `<button class="btn accent" data-action="open-pay">${self ? t('you.markPaid') : t('you.pay')}</button>`)
  }
  if (pledge > 0) {
    const paid = mine.filter((x) => x.status === 'paid')
    const nextText = t(r.mode === 'invoice' ? 'you.nextInvoice' : 'you.nextFrom', { day: esc(date(r.nextInvoiceAt)) })
    return card('ok', t('you.in', { amount: fmt(r.myPledge), symbol: sym, per: p.per }),
      r.phase === 'running' && r.invoiceCount < r.installments
        ? t('you.paidOf', { paid: paid.length, n: r.installments }) + ' ' + nextText
        : t('you.paid', { n: paid.length }),
      paid.length ? `<button class="btn ghost" data-action="show-receipt" data-index="${paid.at(-1).index}">${t('you.lastReceipt')}</button>` : '')
  }
  return card('', r.phase === 'failed' ? t('round.phase.failed') : t('you.notBid'), r.phase === 'failed' ? t('you.noInstallments') : t('you.biddingOver'))
}

/** The organizer's project page: the whole round and what to do for it. Own bids live on the bid page. */
function projectCard (ui, r) {
  const sym = esc(r.symbol)
  if (r.phase === 'bidding') return '' // progress and deadline are in the header and the ring
  if (r.mode === 'invoice' && (r.phase === 'running' || r.phase === 'completed')) {
    const last = (r.invoices || []).filter((x) => x.status === 'issued').at(-1)
    return card('', last ? t('you.invoicePaidBy', { i: last.index + 1, paid: last.paidCount, n: r.bidders }) : t('you.running'),
      r.phase === 'running' && r.invoiceCount < r.installments
        ? t('you.autoInvoices', { day: esc(date(r.nextInvoiceAt)) })
        : t('you.allSent', { n: r.installments }),
      last ? `<button class="btn ghost" data-action="show-invoice" data-index="${last.index}">${t('you.whoPaid')}</button>` : '')
  }
  if (r.phase === 'running' && r.canInvoice) {
    return card('act', t('you.due', { i: r.invoiceCount + 1 }), t('you.dueNote', { amount: fmt(r.total), symbol: sym }),
      btn(ui, 'invoice', t('you.issue'), 'accent', { busy: t('you.issuing') }))
  }
  const billed = t('you.billed', { done: r.invoiceCount, n: r.installments })
  if (r.phase === 'running') return card('', t('you.nextAt', { day: esc(date(r.nextInvoiceAt)) }), billed)
  if (r.phase === 'completed') return card('', t('you.completed'), billed)
  return card('', t('round.phase.failed'), t('you.refunding'))
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
    ? (payg ? t('you.bidInvoice', { end: esc(dayTime(r.biddingEnd)) }) : t('you.bidDeposit', { amount: fmt(r.myDeposit), symbol: sym, end: esc(dayTime(r.biddingEnd)) }))
    : r.guide ? t('you.guide', { amount: fmt(r.guide), symbol: sym, per: p.per }) : t('round.installmentsTitle', { n: r.installments, adj: esc(p.adj) }) + '.'
  return `<div class="you bid-box ${pledge > 0 ? 'ok' : 'act'}" role="status">
    <div class="bid-box-main">
      <p class="small muted bid-box-label">${t('you.yourBid')}</p>
      <p class="bid-box-amount"><strong class="${pledge > 0 ? '' : 'none'}">${fmt(pledge)}</strong> ${sym} <span>${p.per}</span></p>
      <p class="small muted">${note}</p>
    </div>
    <div class="you-actions">
      <button class="btn accent" data-action="start-bid">${pledge > 0 ? t('you.raise') : t('you.bid')}</button>
      ${pledge > 0 ? link(ui, 'withdraw', ui.pending === 'withdraw' ? t('you.withdrawing') : t('you.withdraw')) : ''}
    </div>
  </div>`
}
