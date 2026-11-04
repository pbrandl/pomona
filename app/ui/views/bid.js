/**
 * Bidding as a three-step flow, one step per page: Betrag → Prüfen → Fertig.
 * The transaction progress is shown on the "Prüfen" page while it runs.
 * @module ui/views/bid
 */
import { esc, fmt, num, per, dayTime, date } from '../format.js'
import { page, spinner } from './parts.js'
import { ICON } from './icons.js'
import { t, raw } from '../../i18n/index.js'

const bidSteps = () => raw('bid.steps')

const TX_STEPS = ['prepare', 'sign', 'confirm']

/** Progress of a running transaction. */
export function stepper (step, done = false) {
  const at = done ? TX_STEPS.length : Math.max(0, TX_STEPS.indexOf(step))
  return `<ol class="stepper">${TX_STEPS.map((key, i) => {
    const label = t('bid.tx.' + key)
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
  const day = esc(date(r.biddingEnd))
  const what = amount > 0 ? `<strong>${fmt(amount + num(r.myPledge))} ${sym}</strong>` : t('bid.yourAmount')
  const min = '' // the minimum bid sits under the figure, always visible
  let note
  if (payg) {
    note = { lead: t('bid.nothingToday'), detail: t('bid.fromInvoice', { day, adj: esc(p.adj), what }) + min }
  } else if (amount > 0 && cost > balance) {
    note = { lead: t('bid.missing', { amount: fmt(cost - balance), symbol: sym }), detail: t('bid.depositCalc', { n: r.installments, amount: fmt(amount), cost: fmt(cost), symbol: sym }) + ` · <button class="link" data-action="open-fund">${t('wallet.fund')}</button>`, warn: true }
  } else if (amount > 0) {
    note = { lead: t(has ? 'bid.depositMore' : 'bid.deposit', { amount: fmt(cost), symbol: sym }), detail: t('bid.inEscrow', { n: r.installments, amount: fmt(amount), symbol: sym }) }
  } else {
    note = { lead: t('bid.allUpfront'), detail: t('bid.inEscrowAmount', { n: r.installments }) + min }
  }
  const hint = `<span class="note-lead">${ICON.info}${note.lead}</span><span class="note-detail">${note.detail}</span>`
  const unit = `<span class="amount-unit">${esc(r.symbol)} ${p.per}${num(r.minBid) > 0 && !has ? ' · ' + t('bid.atLeast', { amount: fmt(r.minBid) }) : ''}</span>`
  const display = touch
    ? `<div class="amount-display ${amount > 0 ? '' : 'empty'}" aria-live="polite"><strong>${typed(ui.draft.amount)}</strong>${unit}</div>`
    : `<label class="amount-display desktop" for="amount">
        <input id="amount" data-draft="amount" inputmode="decimal" value="${esc(ui.draft.amount)}" autocomplete="off" autofocus aria-label="${t('bid.inputAria', { per: p.per, symbol: esc(r.symbol) })}">
        ${unit}
      </label>`
  return page(null, `
    <div class="bid-progress-box">${progressBar(r, amount)}</div>
    ${display}
    ${!has && r.guide ? guideChips(ui, r, p) : ''}
    <p class="bid-hint ${note.warn ? 'warn' : ''}">${hint}</p>
    ${touch ? keypad() : ''}
    <div class="actions sticky"><button class="btn accent block" data-action="review-bid" ${amount > 0 ? '' : 'disabled'}>${t('common.next')}</button></div>`,
  { steps: bidSteps(), at: 0, cls: touch ? 'fit' : 'fit desk' })
}

/** Where the round stands, and how far your bid moves it toward the target. */
function progressBar (r, amount) {
  const target = num(r.target)
  if (!(target > 0)) return ''
  const before = num(r.total)
  const after = before + amount
  const w = (v) => Math.max(0, Math.min(100, (v / target) * 100))
  const text = amount > 0
    ? t('bid.progress', { now: `<strong>${fmt(after, 0)}</strong>`, target: fmt(target, 0), symbol: esc(r.symbol), pct: fmt((after / target) * 100, 0) })
    : t('bid.progress', { now: `<strong>${fmt(before, 0)}</strong>`, target: fmt(target, 0), symbol: esc(r.symbol), pct: fmt((before / target) * 100, 0) })
  return `<div class="bid-progress">
    <div class="bp-track" role="img" aria-label="${t(amount > 0 ? 'bid.progressMine' : 'bid.progressRound')}">
      <i class="bp-now" style="width:${w(before)}%"></i>
      <i class="bp-mine" style="left:${w(before)}%;width:${Math.max(0, w(after) - w(before))}%"></i>
    </div>
    <p class="small muted">${text}</p>
  </div>`
}

/** What was typed on the keypad, with thousands dots and a trailing comma kept ("1.200,5"). */
function typed (raw) {
  const [int, dec] = String(raw || '').split(',')
  const n = int ? fmt(Number(int), 0) : '0'
  return dec === undefined ? n : `${n},${dec}`
}

/** Digits, comma (cents, as in franzwerk), delete. */
function keypad () {
  const key = (k, label = k, aria = k) => `<button class="key" data-action="key" data-key="${k}" aria-label="${aria}">${label}</button>`
  return `<div class="keypad" role="group" aria-label="${t('bid.keypad')}">
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => key(String(n))).join('')}
    ${key(',', ',', t('bid.comma'))}${key('0')}${key('del', '⌫', t('bid.delete'))}
  </div>`
}

/** Quick picks around the organizer's guide value ("Richtwert"). */
function guideChips (ui, r, p) {
  const g = num(r.guide)
  const min = num(r.minBid)
  const values = [...new Set([Math.round(g * 0.8), g, Math.round(g * 1.2)])].filter((v) => v > 0 && v >= min)
  const chips = values.map((v) => {
    const on = num(ui.draft.amount) === v
    return `<button class="chip ${on ? 'on' : ''} ${v === g ? 'guide' : ''}" data-action="pick-amount" data-amount="${v}">${fmt(v)}${v === g ? ` <span>${t('label.guide')}</span>` : ''}</button>`
  }).join('')
  return `<div><p class="small muted guide-text" style="margin-bottom:8px">${t('you.guide', { amount: fmt(g), symbol: esc(r.symbol), per: p.per })}</p><div class="chips">${chips}</div></div>`
}

function reviewPage (ui) {
  const r = ui.status.round
  const q = ui.quote
  const p = per(r.intervalName)
  const running = ui.pending === 'confirm-bid'
  const opts = { steps: bidSteps(), at: 1, back: running ? false : 'bid-back' }
  if (!q) return page(t('bid.review'), `<p class="verify pending">${spinner} ${t('bid.calculating')}</p>`, opts)

  const fee = q.fee === null ? t('bid.noFee') : t('bid.fee', { amount: fmt(q.fee, 4), symbol: esc(q.symbol) })
  if (q.mode === 'invoice') {
    return page(t('bid.review'), `
    <div class="receipt">
      <div class="receipt-head"><span class="small muted">${esc(r.title)}</span><strong>${fmt(q.pledgeAfter)} ${esc(q.symbol)} ${p.per}</strong></div>
      <dl>
        <dt>${t('create.invoices')}</dt><dd>${t('bid.schedule', { n: q.installments, adj: esc(p.adj), day: esc(date(r.biddingEnd)) })}</dd>
        <dt>${t('bid.chargedNow')}</dt><dd><strong>${t('bid.nothing')}</strong></dd>
        <dt>${t('bid.networkFee')}</dt><dd>${fee}</dd>
      </dl>
    </div>
    ${q.enough
      ? ''
      : `<div class="warning"><strong>${t('bid.missingFee', { amount: fmt(q.missing, 4), symbol: esc(q.symbol) })}</strong><p>${t('bid.missingFeeNote')}</p></div>`}
    <ul class="facts">
      <li>${t('bid.factPledge', { amount: fmt(q.pledgeAfter), symbol: esc(q.symbol) })}</li>
      <li>${t('bid.factInvoice')}</li>
      <li>${t('bid.factChange', { end: esc(dayTime(r.biddingEnd)) })}</li>
    </ul>
    ${running ? stepper(ui.status.busyStep) : ''}
    <div class="actions sticky">${q.enough
      ? `<button class="btn accent block" data-action="confirm-bid" ${running ? 'disabled' : ''}>${running ? t('common.wait') : t('bid.confirmInvoice')}</button>`
      : `<button class="btn accent block" data-action="open-fund">${t('fund.title')}</button>`}</div>`, opts)
  }
  return page(t('bid.review'), `
    <div class="receipt">
      <div class="receipt-head"><span class="small muted">${esc(r.title)}</span><strong>${fmt(q.amount)} ${esc(q.symbol)} ${p.per}</strong></div>
      <dl>
        <dt>${t('bid.installments')}</dt><dd>${t('bid.schedule', { n: q.installments, adj: esc(p.adj), day: esc(date(r.biddingEnd)) })}</dd>
        <dt>${t('bid.depositedNow')}</dt><dd><strong>${fmt(q.deposit)} ${esc(q.symbol)}</strong></dd>
        <dt>${t('bid.networkFee')}</dt><dd>${fee}</dd>
        <dt>${t('bid.balance')}</dt><dd>${fmt(q.balance)} ${esc(q.symbol)}</dd>
      </dl>
    </div>
    ${q.enough
      ? `<ul class="facts">
          <li>${t('bid.factEscrow')}</li>
          <li>${t('bid.factChange', { end: esc(dayTime(r.biddingEnd)) })}</li>
          <li>${t('bid.factBack')}</li>
          <li>${t('bid.factReceipt')}</li>
        </ul>`
      : `<div class="warning"><strong>${t('bid.missing', { amount: fmt(q.missing), symbol: esc(q.symbol) })}</strong><p>${t('bid.missingNote')}</p></div>`}
    ${running ? stepper(ui.status.busyStep) : ''}
    <div class="actions sticky">
      ${q.enough
        ? `<button class="btn accent block" data-action="confirm-bid" ${running ? 'disabled' : ''}>${running ? t('common.wait') : t('bid.confirmDeposit')}</button>`
        : `<button class="btn accent block" data-action="open-fund">${t('fund.title')}</button>`}
    </div>`, opts)
}

function donePage (ui) {
  const r = ui.status.round
  const done = ui.bidDone
  const p = per(r.intervalName)
  return page(null, `
    <div class="stack" style="text-align:center;align-items:center">
      <div class="big-check">✓</div>
      <h1 style="font-size:26px">${t(r.mode === 'invoice' ? 'bid.doneInvoice' : 'bid.doneDeposit')}</h1>
      <p class="muted">${fmt(done.pledgeAfter)} ${esc(r.symbol)} ${p.per} · ${r.mode === 'invoice' ? t('bid.paidPerInvoice') : t('bid.deposited', { amount: fmt(done.deposit), symbol: esc(r.symbol) })}</p>
    </div>
    ${stepper(null, true)}
    <p class="small muted">${t('bid.factChange', { end: esc(dayTime(r.biddingEnd)) })} ${t('bid.doneNote')}</p>
    <div class="actions sticky"><button class="btn accent block" data-action="close-sheet">${t('bid.toRound')}</button></div>`,
  { steps: bidSteps(), at: 2, back: false })
}
