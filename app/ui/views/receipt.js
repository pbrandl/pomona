/**
 * Receipt QR for bidders and the verification result for organizers.
 * @module ui/views/receipt
 */
import { esc, fmt, date, short } from '../format.js'
import { sheet } from './parts.js'

export function receiptSheet (ui) {
  const rc = ui.receipt
  return sheet(`Beleg · Rate ${rc.index + 1}`, `
    <p class="muted">Dieser Code beweist, dass du Rate ${rc.index + 1} bezahlt hast. Jeder kann ihn mit Pomona gegen die Blockchain prüfen.</p>
    <div class="qr" style="width:220px;height:220px;margin:0 auto">${rc.qr}</div>
    <div class="linkbox">${esc(rc.code)}</div>
    <button class="btn ghost small" data-action="copy-receipt">Code kopieren</button>`)
}

export function verifySheet (ui) {
  const v = ui.verified
  if (!v.valid) {
    return sheet('Beleg prüfen', `<span class="badge warn">Ungültig</span><p>${esc(v.reason || 'Dieser Beleg ist nicht gültig.')}</p>`)
  }
  return sheet('Beleg prüfen', `
    <span class="badge">Gültig</span>
    <div class="stack">
      ${v.title ? `<p><strong>${esc(v.title)}</strong></p>` : ''}
      <div class="mine"><span class="muted">Rate</span><strong>${v.installment} von ${v.installments}</strong></div>
      <div class="mine"><span class="muted">Betrag</span><strong>${fmt(v.amount)} ${esc(v.symbol)}</strong></div>
      <div class="mine"><span class="muted">Bezahlt am</span><span>${esc(date(v.paidAt))}</span></div>
      <div class="mine"><span class="muted">Von</span><span class="mono">${esc(short(v.bidder))}</span></div>
    </div>
    <p class="small muted">Geprüft direkt am Contract <span class="mono">${esc(short(v.round))}</span>.</p>`)
}
