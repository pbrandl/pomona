/**
 * Bid confirmation: what exactly happens, what it costs, and live progress
 * until the bid is in the contract.
 * @module ui/views/bid
 */
import { esc, fmt, per, dayTime, date } from '../format.js'
import { sheet, spinner } from './parts.js'

const STEPS = [
  ['prepare', 'Wird vorbereitet'],
  ['sign', 'Wird unterschrieben und gesendet'],
  ['confirm', 'Wird im Netzwerk bestätigt']
]

/** Three-step progress for a running transaction. */
export function stepper (step, done = false) {
  const at = done ? STEPS.length : Math.max(0, STEPS.findIndex(([k]) => k === step))
  return `<ol class="stepper">${STEPS.map(([, label], i) => {
    const state = i < at ? 'done' : i === at ? 'now' : 'todo'
    const icon = state === 'done' ? '✓' : state === 'now' ? spinner : ''
    return `<li class="${state}"><span class="st-dot">${icon}</span>${esc(label)}</li>`
  }).join('')}</ol>`
}

export function bidSheet (ui) {
  const r = ui.status.round
  const q = ui.quote
  const p = per(r.intervalName)
  const running = ui.pending === 'confirm-bid'
  const done = ui.bidDone

  if (done) {
    return sheet(null, `
      <div class="stack" style="text-align:center;align-items:center">
        <div class="big-check">✓</div>
        <h1 style="font-size:24px">Dein Gebot ist im Contract</h1>
        <p class="muted">${fmt(done.pledgeAfter)} ${esc(r.symbol)} ${p.per} · ${fmt(done.deposit)} ${esc(r.symbol)} hinterlegt</p>
      </div>
      ${stepper(null, true)}
      <p class="small muted">Bis ${esc(dayTime(r.biddingEnd))} kannst du erhöhen oder zurückziehen. Wir melden uns, sobald feststeht, ob das Ziel erreicht ist.</p>
      <button class="btn accent block" data-action="close-sheet">Fertig</button>`, { dismiss: false, close: false })
  }

  if (!q) return sheet('Gebot prüfen', `<p class="verify pending">${spinner} Wird berechnet…</p>`)

  const fee = q.fee === null ? 'keine' : `ca. ${fmt(q.fee, 4)} ${esc(q.symbol)}`
  return sheet('Gebot prüfen', `
    <div class="receipt">
      <div class="receipt-head"><span class="small muted">${esc(r.title)}</span><strong>${fmt(q.amount)} ${esc(q.symbol)} ${p.per}</strong></div>
      <dl>
        <dt>Raten</dt><dd>${q.installments} × ${esc(p.adj)}, ab ${esc(date(r.biddingEnd))}</dd>
        <dt>Jetzt hinterlegt</dt><dd><strong>${fmt(q.deposit)} ${esc(q.symbol)}</strong></dd>
        <dt>Netzwerkgebühr</dt><dd>${fee}</dd>
        <dt>Dein Guthaben</dt><dd>${fmt(q.balance)} ${esc(q.symbol)}</dd>
      </dl>
    </div>
    ${q.enough
      ? `<ul class="facts">
          <li>Das Geld liegt im Treuhand-Contract, nicht beim Organisator.</li>
          <li>Bis ${esc(dayTime(r.biddingEnd))} kannst du erhöhen oder zurückziehen.</li>
          <li>Wird das Ziel nicht erreicht, bekommst du alles zurück.</li>
          <li>Für jede abgerechnete Rate bekommst du einen Beleg.</li>
        </ul>`
      : `<div class="warning"><strong>Dir fehlen ${fmt(q.missing)} ${esc(q.symbol)}</strong><p>Lade dein Konto auf oder biete weniger.</p></div>`}
    ${running ? stepper(ui.status.busyStep) : ''}
    ${q.enough
      ? `<button class="btn accent block" data-action="confirm-bid" ${running ? 'disabled' : ''}>${running ? 'Bitte warten…' : 'Verbindlich bieten'}</button>`
      : '<button class="btn accent block" data-action="open-fund">Konto aufladen</button>'}
    ${running ? '' : '<button class="btn ghost block" data-action="close-sheet">Abbrechen</button>'}`, { dismiss: !running, close: !running })
}
