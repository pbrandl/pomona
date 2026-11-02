/**
 * Bidding as a three-step flow, one step per page: Betrag → Prüfen → Fertig.
 * The transaction progress is shown on the "Prüfen" page while it runs.
 * @module ui/views/bid
 */
import { esc, fmt, num, per, dayTime, date } from '../format.js'
import { page, spinner } from './parts.js'

export const BID_STEPS = ['Betrag', 'Prüfen', 'Fertig']

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

function amountPage (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  const has = num(r.myPledge) > 0
  const amount = num(ui.draft.amount)
  const payg = r.mode === 'invoice'
  const cost = payg ? 0 : amount * r.installments
  const balance = num(ui.status.wallet.usdt)
  let hint
  if (payg && amount > 0) {
    hint = `Jetzt wird nichts abgebucht. Ab ${esc(date(r.biddingEnd))} kommt ${esc(p.adj)} eine Rechnung über ${fmt(amount + num(r.myPledge))} ${esc(r.symbol)}, ${r.installments}-mal.`
  } else if (amount > 0 && cost > balance) {
    hint = `<span class="warn-text">Dafür brauchst du ${fmt(cost)} ${esc(r.symbol)}, dir fehlen ${fmt(cost - balance)}.</span> <button class="link" data-action="open-fund">Aufladen</button>`
  } else if (amount > 0) {
    hint = `${has ? 'Zusätzlich hinterlegst du' : 'Du hinterlegst'} ${r.installments} × ${fmt(amount)} = ${fmt(cost)} ${esc(r.symbol)}.`
  } else {
    hint = num(r.minBid) > 0 ? `Mindestgebot ${fmt(r.minBid)} ${esc(r.symbol)} ${p.per}.` : `Dein Guthaben: ${fmt(balance)} ${esc(r.symbol)}.`
  }
  return page(has ? 'Um wie viel erhöhen?' : `Wie viel ${p.per}?`, `
    ${has ? `<p class="lead">Du bietest bisher ${fmt(r.myPledge)} ${esc(r.symbol)} ${p.per}.</p>` : `<p class="lead">${esc(r.title)} · ${r.installments} Raten, ${esc(p.adj)}.</p>`}
    ${!has && r.guide ? guideChips(ui, r, p) : ''}
    <div class="amount big">
      <input id="amount" data-draft="amount" inputmode="decimal" placeholder="0" value="${esc(ui.draft.amount)}" autocomplete="off" autofocus>
      <span class="unit">${esc(r.symbol)} ${p.per}</span>
    </div>
    <p class="small muted">${hint}</p>
    <div class="actions sticky"><button class="btn accent block" data-action="review-bid" ${amount > 0 ? '' : 'disabled'}>Weiter</button></div>`,
  { steps: BID_STEPS, at: 0 })
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
  return `<div><p class="small muted" style="margin-bottom:8px">Richtwert: ${fmt(g)} ${esc(r.symbol)} ${p.per}. Gib, was du kannst.</p><div class="chips">${chips}</div></div>`
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
