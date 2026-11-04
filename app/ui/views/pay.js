/**
 * Paying an invoice (rounds "Per Rechnung"): Prüfen → Fertig, one page each.
 * The amount goes from the bidder's wallet straight to the organizer; only
 * then is there a receipt. Without enough USDT the page says what is missing
 * and offers "Aufladen" instead of a button that would fail.
 * @module ui/views/pay
 */
import { esc, fmt, per, date, short } from '../format.js'
import { page, spinner } from './parts.js'
import { stepper } from './bid.js'
import { t, raw } from '../../i18n/index.js'

const paySteps = () => raw('pay.steps')

export function payPage (ui) {
  return ui.payStep === 'done' ? donePage(ui) : reviewPage(ui)
}

/** "Rechnung 3" or "Rechnungen 2 und 3". */
function names (list) {
  if (list.length === 1) return t('pay.one', { i: list[0] })
  return t('pay.many', { list: list.slice(0, -1).join(', '), last: list.at(-1) })
}

function reviewPage (ui) {
  const r = ui.status.round
  const q = ui.payQuote
  const p = per(r.intervalName)
  const running = ui.pending === 'confirm-pay'
  const opts = { steps: paySteps(), at: 0, back: running ? false : 'close-sheet' }
  if (!q) return page(t('pay.title'), `<p class="verify pending">${spinner} ${t('bid.calculating')}</p>`, opts)

  const first = r.myInvoices[q.invoices[0] - 1]
  const fee = q.fee === null ? t('bid.noFee') : t('bid.fee', { amount: fmt(q.fee, 4), symbol: esc(q.symbol) })
  return page(t('pay.title'), `
    <div class="receipt">
      <div class="receipt-head"><span class="small muted">${esc(r.title)}</span><strong>${fmt(q.amount)} ${esc(q.symbol)}</strong></div>
      <dl>
        <dt>${t('pay.for')}</dt><dd>${t('pay.forValue', { names: esc(names(q.invoices)), n: r.installments, adj: esc(p.adj) })}</dd>
        <dt>${t('pay.dueSince')}</dt><dd>${esc(date(first.dueAt))}</dd>
        <dt>${t('pay.to')}</dt><dd${q.self ? '' : ' class="mono"'}>${q.self ? t('pay.toSelf') : t('pay.toOrganizer', { address: esc(short(r.organizer)) })}</dd>
        <dt>${t('bid.networkFee')}</dt><dd>${fee}</dd>
        <dt>${t('bid.balance')}</dt><dd>${fmt(q.balance)} ${esc(q.symbol)}</dd>
      </dl>
    </div>
    ${q.self
      ? `<p class="small muted">${t('pay.selfNote')}</p>`
      : q.enough
      ? `<p class="small muted">${t('pay.note')}</p>`
      : `<div class="warning"><strong>${t('bid.missing', { amount: fmt(q.missing), symbol: esc(q.symbol) })}</strong><p>${t('pay.missingNote')}</p></div>`}
    ${running ? stepper(ui.status.busyStep) : ''}
    <div class="actions sticky">
      ${q.enough
        ? `<button class="btn accent block" data-action="confirm-pay" ${running ? 'disabled' : ''}>${running ? t('common.wait') : q.self ? t('you.markPaid') : t('pay.payAmount', { amount: fmt(q.amount), symbol: esc(q.symbol) })}</button>`
        : `<button class="btn accent block" data-action="open-fund">${t('fund.title')}</button>`}
    </div>`, opts)
}

function donePage (ui) {
  const r = ui.status.round
  const d = ui.payDone
  return page(null, `
    <div class="stack" style="text-align:center;align-items:center">
      <div class="big-check">✓</div>
      <h1 style="font-size:26px">${t('pay.done')}</h1>
      <p class="muted">${esc(names(d.invoices))} · ${fmt(d.amount)} ${esc(r.symbol)}</p>
    </div>
    ${stepper(null, true)}
    <p class="small muted">${t('pay.doneNote')}</p>
    <div class="actions sticky">
      <button class="btn accent block" data-action="show-receipt" data-index="${d.invoices.at(-1) - 1}">${t('pay.showReceipt')}</button>
      <button class="btn ghost block" data-action="close-sheet">${t('bid.toRound')}</button>
    </div>`,
  { steps: paySteps(), at: 1, back: false })
}
