/**
 * Bidding as a three-step flow, one step per page: Betrag → Prüfen → Fertig.
 * The transaction progress is shown on the "Prüfen" page while it runs.
 * @module ui/views/bid
 */
import { esc, fmt, num, per, dayTime, date } from '../format.js'
import { page, spinner } from './parts.js'
import { ICON } from './icons.js'

const BID_STEPS = ['Betrag', 'Prüfen', 'Fertig']

const TX_STEPS = [
  ['prepare', 'Wird vorbereitet'],
  ['sign', 'Wird unterschrieben und gesendet'],
  ['confirm', 'Wird im Netzwerk bestätigt']
]

/** Progress of a running transaction. */
export function stepper (step, done = false) {
  const at = done ? TX_STEPS.length : Math.max(0, TX_STEPS.findIndex(([k]) => k === step))
  return `<ol class="stepper">${TX_STEPS.map(([, label], i) => {
    const state = i < at ? 'done' : i === at ? 'now' : 'todo'
    const icon = state === 'done' ? '✓' : state === 'now' ? spinner : ''
    return `<li class="${state}"><span class="st-dot">${icon}</span>${esc(label)}</li>`
  }).join('')}</ol>`
}

export function bidPage (ui) {
  if (ui.bidStep === 'done') return donePage(ui)
  if (ui.bidStep === 'review') return reviewPage(ui)
  return amountPage(ui)
}

/** Touch screens get a keypad instead of the system keyboard (see Contrib). */
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

function amountPage (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  const has = num(r.myPledge) > 0
  const amount = num(ui.draft.amount)
  const payg = r.mode === 'invoice'
  const cost = payg ? 0 : amount * r.installments
  const balance = num(ui.status.wallet.usdt)
  const touch = isTouch() // touch: keypad; desktop: a focused text field with a blinking caret
  // The note is always there: one quiet line, one detail line.
  const sym = esc(r.symbol)
  const day = esc(new Date(r.biddingEnd * 1000).toLocaleDateString('de-DE'))
  const what = amount > 0 ? `<strong>${fmt(amount + num(r.myPledge))} ${sym}</strong>` : 'dein Betrag'
  const min = '' // the minimum bid sits under the figure, always visible
  let note
  if (payg) {
    note = { lead: 'Heute wird nichts abgebucht', detail: `Ab ${day} ${esc(p.adj)} ${what} per Rechnung${min}` }
  } else if (amount > 0 && cost > balance) {
    note = { lead: `Dir fehlen ${fmt(cost - balance)} ${sym}`, detail: `Hinterlegt werden ${r.installments} × ${fmt(amount)} = ${fmt(cost)} ${sym} · <button class="link" data-action="open-fund">Aufladen</button>`, warn: true }
  } else if (amount > 0) {
    note = { lead: `${has ? 'Zusätzlich hinterlegt' : 'Hinterlegt'}: ${fmt(cost)} ${sym}`, detail: `${r.installments} × ${fmt(amount)} ${sym} im Treuhandkonto` }
  } else {
    note = { lead: 'Hinterlegt wird alles vorab', detail: `${r.installments} × dein Betrag im Treuhandkonto${min}` }
  }
  const hint = `<span class="note-lead">${ICON.info}${note.lead}</span><span class="note-detail">${note.detail}</span>`
  const unit = `<span class="amount-unit">${esc(r.symbol)} ${p.per}${num(r.minBid) > 0 && !has ? ` · mindestens ${fmt(r.minBid)}` : ''}</span>`
  const display = touch
    ? `<div class="amount-display ${amount > 0 ? '' : 'empty'}" aria-live="polite"><strong>${typed(ui.draft.amount)}</strong>${unit}</div>`
    : `<label class="amount-display desktop" for="amount">
        <input id="amount" data-draft="amount" inputmode="decimal" value="${esc(ui.draft.amount)}" autocomplete="off" autofocus aria-label="Dein Gebot ${p.per} in ${esc(r.symbol)}">
        ${unit}
      </label>`
  return page(null, `
    <div class="bid-progress-box">${progressBar(r, amount)}</div>
    ${display}
    ${!has && r.guide ? guideChips(ui, r, p) : ''}
    <p class="bid-hint ${note.warn ? 'warn' : ''}">${hint}</p>
    ${touch ? keypad() : ''}
    <div class="actions sticky"><button class="btn accent block" data-action="review-bid" ${amount > 0 ? '' : 'disabled'}>Weiter</button></div>`,
  { steps: BID_STEPS, at: 0, cls: touch ? 'fit' : 'fit desk' })
}

/** Where the round stands, and how far your bid moves it toward the target. */
function progressBar (r, amount) {
  const target = num(r.target)
  if (!(target > 0)) return ''
  const before = num(r.total)
  const after = before + amount
  const w = (v) => Math.max(0, Math.min(100, (v / target) * 100))
  const text = amount > 0
    ? `<strong>${fmt(after, 0)}</strong> von ${fmt(target, 0)} ${esc(r.symbol)} · ${fmt((after / target) * 100, 0)} %`
    : `<strong>${fmt(before, 0)}</strong> von ${fmt(target, 0)} ${esc(r.symbol)} · ${fmt((before / target) * 100, 0)} %`
  return `<div class="bid-progress">
    <div class="bp-track" role="img" aria-label="${amount > 0 ? 'Fortschritt mit deinem Gebot' : 'Fortschritt der Runde'}">
      <i class="bp-now" style="width:${w(before)}%"></i>
      <i class="bp-mine" style="left:${w(before)}%;width:${Math.max(0, w(after) - w(before))}%"></i>
    </div>
    <p class="small muted">${text}</p>
  </div>`
}

/** What was typed on the keypad, with thousands dots and a trailing comma kept ("1.200,5"). */
function typed (raw) {
  const [int, dec] = String(raw || '').split(',')
  const n = int ? Number(int).toLocaleString('de-DE') : '0'
  return dec === undefined ? n : `${n},${dec}`
}

/** Digits, comma (cents, as in franzwerk), delete. */
function keypad () {
  const key = (k, label = k, aria = k) => `<button class="key" data-action="key" data-key="${k}" aria-label="${aria}">${label}</button>`
  return `<div class="keypad" role="group" aria-label="Ziffernblock">
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => key(String(n))).join('')}
    ${key(',', ',', 'Komma')}${key('0')}${key('del', '⌫', 'Löschen')}
  </div>`
}

/** Quick picks around the organizer's guide value ("Richtwert"). */
function guideChips (ui, r, p) {
  const g = num(r.guide)
  const min = num(r.minBid)
  const values = [...new Set([Math.round(g * 0.8), g, Math.round(g * 1.2)])].filter((v) => v > 0 && v >= min)
  const chips = values.map((v) => {
    const on = num(ui.draft.amount) === v
    return `<button class="chip ${on ? 'on' : ''} ${v === g ? 'guide' : ''}" data-action="pick-amount" data-amount="${v}">${fmt(v)}${v === g ? ' <span>Richtwert</span>' : ''}</button>`
  }).join('')
  return `<div><p class="small muted guide-text" style="margin-bottom:8px">Richtwert: ${fmt(g)} ${esc(r.symbol)} ${p.per}. Gib, was du kannst.</p><div class="chips">${chips}</div></div>`
}

function reviewPage (ui) {
  const r = ui.status.round
  const q = ui.quote
  const p = per(r.intervalName)
  const running = ui.pending === 'confirm-bid'
  const opts = { steps: BID_STEPS, at: 1, back: running ? false : 'bid-back' }
  if (!q) return page('Gebot prüfen', `<p class="verify pending">${spinner} Wird berechnet…</p>`, opts)

  const fee = q.fee === null ? 'keine' : `ca. ${fmt(q.fee, 4)} ${esc(q.symbol)}`
  if (q.mode === 'invoice') {
    return page('Gebot prüfen', `
    <div class="receipt">
      <div class="receipt-head"><span class="small muted">${esc(r.title)}</span><strong>${fmt(q.pledgeAfter)} ${esc(q.symbol)} ${p.per}</strong></div>
      <dl>
        <dt>Rechnungen</dt><dd>${q.installments} × ${esc(p.adj)}, ab ${esc(date(r.biddingEnd))}</dd>
        <dt>Jetzt abgebucht</dt><dd><strong>nichts</strong></dd>
        <dt>Netzwerkgebühr</dt><dd>${fee}</dd>
      </dl>
    </div>
    ${q.enough
      ? ''
      : `<div class="warning"><strong>Dir fehlen ${fmt(q.missing, 4)} ${esc(q.symbol)} für die Netzwerkgebühr</strong><p>Auch eine Zusage ist eine Transaktion. Lade ein paar Cent auf.</p></div>`}
    <ul class="facts">
      <li>Du sagst ${fmt(q.pledgeAfter)} ${esc(q.symbol)} pro Rate zu. Abgebucht wird nichts.</li>
      <li>Wird das Ziel erreicht, kommt jede Rate als Rechnung. Du bezahlst sie mit einem Tipp und bekommst einen Beleg.</li>
      <li>Bis ${esc(dayTime(r.biddingEnd))} kannst du erhöhen oder zurückziehen.</li>
    </ul>
    ${running ? stepper(ui.status.busyStep) : ''}
    <div class="actions sticky">${q.enough
      ? `<button class="btn accent block" data-action="confirm-bid" ${running ? 'disabled' : ''}>${running ? 'Bitte warten…' : 'Verbindlich zusagen'}</button>`
      : '<button class="btn accent block" data-action="open-fund">Konto aufladen</button>'}</div>`, opts)
  }
  return page('Gebot prüfen', `
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
          <li>Das Geld liegt im Treuhandkonto, nicht beim Organisator.</li>
          <li>Bis ${esc(dayTime(r.biddingEnd))} kannst du erhöhen oder zurückziehen.</li>
          <li>Wird das Ziel nicht erreicht, bekommst du alles zurück.</li>
          <li>Für jede abgerechnete Rate bekommst du einen Beleg.</li>
        </ul>`
      : `<div class="warning"><strong>Dir fehlen ${fmt(q.missing)} ${esc(q.symbol)}</strong><p>Lade dein Konto auf oder biete weniger.</p></div>`}
    ${running ? stepper(ui.status.busyStep) : ''}
    <div class="actions sticky">
      ${q.enough
        ? `<button class="btn accent block" data-action="confirm-bid" ${running ? 'disabled' : ''}>${running ? 'Bitte warten…' : 'Verbindlich bieten'}</button>`
        : '<button class="btn accent block" data-action="open-fund">Konto aufladen</button>'}
    </div>`, opts)
}

function donePage (ui) {
  const r = ui.status.round
  const done = ui.bidDone
  const p = per(r.intervalName)
  return page(null, `
    <div class="stack" style="text-align:center;align-items:center">
      <div class="big-check">✓</div>
      <h1 style="font-size:26px">${r.mode === 'invoice' ? 'Dein Gebot steht' : 'Dein Gebot liegt im Treuhandkonto'}</h1>
      <p class="muted">${fmt(done.pledgeAfter)} ${esc(r.symbol)} ${p.per} · ${r.mode === 'invoice' ? 'bezahlt wird mit jeder Rechnung' : `${fmt(done.deposit)} ${esc(r.symbol)} hinterlegt`}</p>
    </div>
    ${stepper(null, true)}
    <p class="small muted">Bis ${esc(dayTime(r.biddingEnd))} kannst du erhöhen oder zurückziehen. Wir melden uns, sobald feststeht, ob das Ziel erreicht ist.</p>
    <div class="actions sticky"><button class="btn accent block" data-action="close-sheet">Zur Runde</button></div>`,
  { steps: BID_STEPS, at: 2, back: false })
}
