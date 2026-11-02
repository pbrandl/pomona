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

export const PAY_STEPS = ['Prüfen', 'Fertig']

export function payPage (ui) {
  return ui.payStep === 'done' ? donePage(ui) : reviewPage(ui)
}

/** "Rechnung 3" or "Rechnungen 2 und 3". */
function names (list) {
  if (list.length === 1) return `Rechnung ${list[0]}`
  return `Rechnungen ${list.slice(0, -1).join(', ')} und ${list.at(-1)}`
}

function reviewPage (ui) {
  const r = ui.status.round
  const q = ui.payQuote
  const p = per(r.intervalName)
  const running = ui.pending === 'confirm-pay'
  const opts = { steps: PAY_STEPS, at: 0, back: running ? false : 'close-sheet' }
  if (!q) return page('Rechnung bezahlen', `<p class="verify pending">${spinner} Wird berechnet…</p>`, opts)

  const first = r.invoices[q.invoices[0] - 1]
  const fee = q.fee === null ? 'keine' : `ca. ${fmt(q.fee, 4)} ${esc(q.symbol)}`
  return page('Rechnung bezahlen', `
    <div class="receipt">
      <div class="receipt-head"><span class="small muted">${esc(r.title)}</span><strong>${fmt(q.amount)} ${esc(q.symbol)}</strong></div>
      <dl>
        <dt>Für</dt><dd>${esc(names(q.invoices))} von ${r.installments} · ${esc(p.adj)}</dd>
        <dt>Fällig seit</dt><dd>${esc(date(first.dueAt))}</dd>
        <dt>An</dt><dd class="mono">${esc(short(r.organizer))} (Organisator)</dd>
        <dt>Netzwerkgebühr</dt><dd>${fee}</dd>
        <dt>Dein Guthaben</dt><dd>${fmt(q.balance)} ${esc(q.symbol)}</dd>
      </dl>
    </div>
    ${q.enough
      ? '<p class="small muted">Der Betrag geht direkt aus deinem Konto an den Organisator. Danach bekommst du einen Beleg, den er prüfen kann.</p>'
      : `<div class="warning"><strong>Dir fehlen ${fmt(q.missing)} ${esc(q.symbol)}</strong><p>Ohne Zahlung gibt es keinen Beleg. Lade dein Konto auf, die Rechnung bleibt so lange offen.</p></div>`}
    ${running ? stepper(ui.status.busyStep) : ''}
    <div class="actions sticky">
      ${q.enough
        ? `<button class="btn accent block" data-action="confirm-pay" ${running ? 'disabled' : ''}>${running ? 'Bitte warten…' : `${fmt(q.amount)} ${esc(q.symbol)} bezahlen`}</button>`
        : '<button class="btn accent block" data-action="open-fund">Konto aufladen</button>'}
    </div>`, opts)
}

function donePage (ui) {
  const r = ui.status.round
  const d = ui.payDone
  return page(null, `
    <div class="stack" style="text-align:center;align-items:center">
      <div class="big-check">✓</div>
      <h1 style="font-size:26px">Bezahlt</h1>
      <p class="muted">${esc(names(d.invoices))} · ${fmt(d.amount)} ${esc(r.symbol)}</p>
    </div>
    ${stepper(null, true)}
    <p class="small muted">Dein Beleg liegt in der Ratenliste. Zeig ihn bei Bedarf beim Anbieter vor.</p>
    <div class="actions sticky">
      <button class="btn accent block" data-action="show-receipt" data-index="${d.invoices.at(-1) - 1}">Beleg zeigen</button>
      <button class="btn ghost block" data-action="close-sheet">Zur Runde</button>
    </div>`,
  { steps: PAY_STEPS, at: 1, back: false })
}
