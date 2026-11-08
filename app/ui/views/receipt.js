/**
 * Receipts and their verification.
 *
 *  receiptSheet  Bidder taps a paid installment: a receipt with QR code. The
 *                app verifies it against the contract right away.
 *  invoiceSheet  Organizer taps a paid invoice: amount, date, and the way to
 *                check bidders' receipts.
 *  scanSheet     Organizer checks a receipt: camera (QR) or pasted code.
 *
 * @module ui/views/receipt
 */
import { esc, fmt, date, dayTime, short, per } from '../format.js'
import { btn, field, page, spinner } from './parts.js'
import { t } from '../../i18n/index.js'

/** First letter upper case: label.receipt is lower case because it also sits inside sentences. */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** The verification line under a receipt. */
function verdict (v) {
  if (!v) return `<p class="verify pending">${spinner} ${t('onboarding.checking')}</p>`
  if (!v.valid) return `<p class="verify bad">✕ ${esc(v.reason || t('receipt.invalid'))}</p>`
  return `<p class="verify ok">${t('receipt.genuine')}</p>`
}

export function receiptSheet (ui) {
  const r = ui.status.round
  const rc = ui.receipt
  const inv = r.myInvoices[rc.index]
  const p = per(r.intervalName)
  return page(cap(t('label.receipt')), `
    <div class="receipt">
      <div class="receipt-head">
        <span class="small muted">${t('receipt.kind')}</span>
        <strong>${esc(r.title)}</strong>
      </div>
      <dl>
        <dt>${t('receipt.installment')}</dt><dd>${t('receipt.of', { i: rc.index + 1, n: r.installments })} · ${esc(p.adj)}</dd>
        <dt>${t('label.amount')}</dt><dd><strong>${fmt(inv.amount)} ${esc(r.symbol)}</strong></dd>
        <dt>${t('receipt.paidAt')}</dt><dd>${esc(dayTime(inv.paidAt))}</dd>
        <dt>${t('receipt.from')}</dt><dd class="mono">${esc(short(ui.status.wallet.address))}</dd>
        <dt>${r.mode === 'invoice' ? t('pay.to') : t('round.escrow')}</dt><dd class="mono">${esc(short(r.mode === 'invoice' ? r.organizer : r.address))}</dd>
      </dl>
      <div class="qr receipt-qr">${rc.qr || ''}</div>
      ${verdict(rc.verified)}
    </div>
    <p class="small muted">${t('receipt.note')}</p>
    <button class="btn ghost small" data-action="copy-receipt">${t('receipt.copy')}</button>`)
}

export function invoiceSheet (ui) {
  const r = ui.status.round
  if (r.mode === 'invoice') return paygInvoiceSheet(ui)
  const inv = r.invoices[ui.invoiceIndex]
  return page(t('pay.one', { i: ui.invoiceIndex + 1 }), `
    <div class="receipt">
      <dl>
        <dt>${t('receipt.status')}</dt><dd><span class="pill-s ok">${t('pay.done')}</span></dd>
        <dt>${t('label.amount')}</dt><dd><strong>${fmt(inv.amount)} ${esc(r.symbol)}</strong></dd>
        <dt>${t('receipt.dueFrom')}</dt><dd>${esc(date(inv.dueAt))}</dd>
        <dt>${t('receipt.billedAt')}</dt><dd>${esc(dayTime(inv.paidAt))}</dd>
        <dt>${t('round.bidders', { n: 2 })}</dt><dd>${r.bidders}</dd>
      </dl>
    </div>
    <p class="small muted">${t('receipt.everyone')}</p>
    <button class="btn accent block" data-action="open-scan">${t('agent.action.page.scan')}</button>`)
}

/** Organizer, round "Per Rechnung": who paid this invoice, who has not yet. */
function paygInvoiceSheet (ui) {
  const d = ui.invoiceDetails
  const title = t('pay.one', { i: ui.invoiceIndex + 1 })
  if (!d) return page(title, `<p class="verify pending">${spinner} ${t('receipt.loading')}</p>`)
  const open = d.unpaid.length
    ? `<div class="card-inset stack">
        <strong>${t('receipt.stillOpen', { n: d.unpaid.length })}</strong>
        ${d.unpaid.map((u) => `<div class="row"><span class="mono small">${esc(short(u.bidder))}</span><span>${fmt(u.amount)} ${esc(d.symbol)}</span></div>`).join('')}
        <p class="small muted">${t('receipt.openNote')}</p>
      </div>`
    : `<p class="verify ok">${t('receipt.allPaid')}</p>`
  return page(title, `
    <div class="receipt">
      <dl>
        <dt>${t('receipt.sentAt')}</dt><dd>${esc(date(d.dueAt))}</dd>
        <dt>${t('pay.done')}</dt><dd><strong>${t('receipt.ofN', { i: d.paidCount, n: d.bidders })}</strong></dd>
        <dt>${t('receipt.received')}</dt><dd><strong>${t('receipt.ofSum', { paid: fmt(d.paidSum), total: fmt(d.total), symbol: esc(d.symbol) })}</strong></dd>
      </dl>
    </div>
    ${open}
    ${d.paidCount ? `<button class="btn accent block" data-action="open-scan">${t('agent.action.page.scan')}</button>` : ''}`)
}

export function scanSheet (ui) {
  const v = ui.verified
  let result = ''
  if (v) {
    result = v.valid
      ? `<div class="receipt ok-border">
          <p class="verify ok" style="margin:0 0 12px">${t('receipt.valid')}</p>
          <dl>
            ${v.title ? `<dt>${t('create.round')}</dt><dd>${esc(v.title)}</dd>` : ''}
            <dt>${t('receipt.installment')}</dt><dd>${t('receipt.of', { i: v.installment, n: v.installments })}</dd>
            <dt>${t('label.amount')}</dt><dd><strong>${fmt(v.amount)} ${esc(v.symbol)}</strong></dd>
            <dt>${t('receipt.paidAt')}</dt><dd>${esc(dayTime(v.paidAt))}</dd>
            <dt>${t('receipt.from')}</dt><dd class="mono">${esc(short(v.bidder))}</dd>
          </dl>
        </div>`
      : `<div class="receipt bad-border"><p class="verify bad" style="margin:0">✕ ${esc(v.reason || t('receipt.notValid'))}</p></div>`
    result += `<button class="btn ghost block" data-action="scan-again">${t('receipt.next')}</button>`
  }

  const camera = v
    ? ''
    : ui.scanError
      ? `<p class="small muted">${esc(ui.scanError)}</p>`
      : `<div class="scanner"><div id="scanner-slot"></div><div class="scanner-frame"></div></div>
         <p class="small muted" style="text-align:center">${t('receipt.hold')}</p>`

  return page(t('agent.action.page.scan'), `
    ${result}
    ${camera}
    ${v
? ''
: `<div class="stack">
      ${field(ui, 'verify', t('receipt.paste'), { mono: true, placeholder: 'pomona-beleg://…' })}
      ${btn(ui, 'verify-receipt', t('receipt.check'), 'ghost block', { busy: t('onboarding.checking') })}
    </div>`}`)
}
