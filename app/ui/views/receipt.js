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
import { btn, field, sheet, spinner } from './parts.js'

/** The verification line under a receipt. */
function verdict (v) {
  if (!v) return `<p class="verify pending">${spinner} Wird geprüft…</p>`
  if (!v.valid) return `<p class="verify bad">✕ ${esc(v.reason || 'Ungültig')}</p>`
  return '<p class="verify ok">✓ Echt und bezahlt</p>'
}

export function receiptSheet (ui) {
  const r = ui.status.round
  const rc = ui.receipt
  const inv = r.invoices[rc.index]
  const p = per(r.intervalName)
  return sheet('Beleg', `
    <div class="receipt">
      <div class="receipt-head">
        <span class="small muted">Zahlungsbeleg</span>
        <strong>${esc(r.title)}</strong>
      </div>
      <dl>
        <dt>Rate</dt><dd>${rc.index + 1} von ${r.installments} · ${esc(p.adj)}</dd>
        <dt>Betrag</dt><dd><strong>${fmt(inv.amount)} ${esc(r.symbol)}</strong></dd>
        <dt>Bezahlt am</dt><dd>${esc(dayTime(inv.paidAt))}</dd>
        <dt>Von</dt><dd class="mono">${esc(short(ui.status.wallet.address))}</dd>
        <dt>Treuhandkonto</dt><dd class="mono">${esc(short(r.address))}</dd>
      </dl>
      <div class="qr receipt-qr">${rc.qr || ''}</div>
      ${verdict(rc.verified)}
    </div>
    <p class="small muted">Zeig diesen QR-Code beim Anbieter vor. Er prüft ihn in Pomona unter „Beleg prüfen“ direkt an der Blockchain. Der Code ist mit deinem Konto unterschrieben und 10 Minuten gültig; solange diese Seite offen ist, erneuert er sich von selbst.</p>
    <button class="btn ghost small" data-action="copy-receipt">Code kopieren</button>`)
}

export function invoiceSheet (ui) {
  const r = ui.status.round
  const inv = r.invoices[ui.invoiceIndex]
  return sheet(`Rechnung ${ui.invoiceIndex + 1}`, `
    <div class="receipt">
      <dl>
        <dt>Status</dt><dd><span class="pill-s ok">Bezahlt</span></dd>
        <dt>Betrag</dt><dd><strong>${fmt(inv.amount)} ${esc(r.symbol)}</strong></dd>
        <dt>Fällig ab</dt><dd>${esc(date(inv.dueAt))}</dd>
        <dt>Abgerechnet am</dt><dd>${esc(dayTime(inv.paidAt))}</dd>
        <dt>Bietende</dt><dd>${r.bidders}</dd>
      </dl>
    </div>
    <p class="small muted">Jede bietende Person hat für diese Rate einen Beleg mit ihrem Anteil. Du kannst ihn per QR-Code prüfen.</p>
    <button class="btn accent block" data-action="open-scan">Beleg prüfen</button>`)
}

export function scanSheet (ui) {
  const v = ui.verified
  let result = ''
  if (v) {
    result = v.valid
      ? `<div class="receipt ok-border">
          <p class="verify ok" style="margin:0 0 12px">✓ Gültiger Beleg</p>
          <dl>
            ${v.title ? `<dt>Runde</dt><dd>${esc(v.title)}</dd>` : ''}
            <dt>Rate</dt><dd>${v.installment} von ${v.installments}</dd>
            <dt>Betrag</dt><dd><strong>${fmt(v.amount)} ${esc(v.symbol)}</strong></dd>
            <dt>Bezahlt am</dt><dd>${esc(dayTime(v.paidAt))}</dd>
            <dt>Von</dt><dd class="mono">${esc(short(v.bidder))}</dd>
          </dl>
        </div>`
      : `<div class="receipt bad-border"><p class="verify bad" style="margin:0">✕ ${esc(v.reason || 'Dieser Beleg ist nicht gültig.')}</p></div>`
    result += '<button class="btn ghost block" data-action="scan-again">Nächsten Beleg prüfen</button>'
  }

  const camera = v
    ? ''
    : ui.scanError
      ? `<p class="small muted">${esc(ui.scanError)}</p>`
      : `<div class="scanner"><div id="scanner-slot"></div><div class="scanner-frame"></div></div>
         <p class="small muted" style="text-align:center">Halte den QR-Code des Belegs vor die Kamera.</p>`

  return sheet('Beleg prüfen', `
    ${result}
    ${camera}
    ${v
? ''
: `<div class="stack">
      ${field(ui, 'verify', 'Oder Code einfügen', { mono: true, placeholder: 'pomona-beleg://…' })}
      ${btn(ui, 'verify-receipt', 'Prüfen', 'ghost block', { busy: 'Wird geprüft…' })}
    </div>`}`)
}
