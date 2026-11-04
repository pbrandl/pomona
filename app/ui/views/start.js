/**
 * No round yet: choose between starting one and joining one. Starting is a
 * four-step flow, one step per page: Runde → Bietphase → Raten → Prüfen.
 * @module ui/views/start
 */
import { esc, fmt, num, per, date, dayTime, endOfDay } from '../format.js'
import { btn, field, page } from './parts.js'
import { ICON } from './icons.js'
import { home } from './onboarding.js'
import { t, raw } from '../../i18n/index.js'

export function start (ui) {
  return home(ui, `<div class="stack-lg">
    <div class="stack"><h1>${t('start.title')}</h1><p class="lead">${t('start.lead')}</p></div>
    <div class="stack">
      <button class="card choice" data-action="open-create"><div><strong>${t('start.create')}</strong><span class="muted">${t('start.createHint')}</span></div><span class="chev">›</span></button>
      <button class="card choice" data-action="open-sheet" data-sheet="join"><div><strong>${t('start.join')}</strong><span class="muted">${t('start.joinHint')}</span></div><span class="chev">›</span></button>
    </div>
  </div>`)
}

/** Which fields belong to which step, for validation before "Weiter". */
export function createStepError (ui) {
  const d = ui.draft
  switch (ui.createStep) {
    case 0: return d.title.trim() ? null : t('err.noTitle')
    case 1: return endOfDay(d.endDate) > Date.now() / 1000 + 3600 ? null : t('create.errEnd')
    case 2:
      if (!(num(d.target) > 0)) return t('create.errTarget')
      if (!(Math.floor(num(d.installments)) >= 1)) return t('create.errInstallments')
      return null
    default: return null
  }
}

export function createPage (ui) {
  const d = ui.draft
  const p = per(d.interval)
  const at = ui.createStep
  const steps = raw('create.steps')
  let body = ''
  let next = btn(ui, 'create-next', t('common.next'), 'accent block')

  if (at === 0) {
    body = `${field(ui, 'title', t('create.name'), { placeholder: t('create.namePlaceholder') })}
      ${field(ui, 'website', t('create.website'), { type: 'url', mode: 'url', placeholder: t('create.websitePlaceholder'), hint: t('create.websiteHint') })}`
  } else if (at === 1) {
    body = `<p class="lead">${t('create.endLead')}</p>
      ${field(ui, 'endDate', t('create.end'), { type: 'date' })}
      ${field(ui, 'minBid', t('create.minBid', { per: p.per }), { mode: 'decimal', placeholder: '0' })}`
  } else if (at === 2) {
    const target = num(d.target)
    const mode = (key) =>
      `<button class="card choice mode ${d.mode === key ? 'on' : ''}" data-action="mode" data-mode="${key}" aria-pressed="${d.mode === key}"><div><strong>${t('mode.' + key)}</strong><span class="muted">${t('create.modeHint.' + key)}</span></div><span class="radio" aria-hidden="true"></span></button>`
    body = `<div>
        <label>${t('create.howPaid')}</label>
        <div class="stack">
          ${mode('invoice')}
          ${mode('deposit')}
        </div>
      </div>
      <div>
        <label>${t('create.billing')}</label>
        <div class="tabs">
          <button class="${d.interval === 'week' ? 'on' : ''}" data-action="interval" data-interval="week">${t('create.weekly')}</button>
          <button class="${d.interval === 'month' ? 'on' : ''}" data-action="interval" data-interval="month">${t('create.monthly')}</button>
        </div>
      </div>
      ${field(ui, 'target', t('create.target', { per: p.per }), { mode: 'decimal', placeholder: '4.000' })}
      ${field(ui, 'installments', t('create.installments'), { mode: 'numeric', placeholder: '12' })}
      ${field(ui, 'guide', t('create.guide', { per: p.per }), { mode: 'decimal', placeholder: target > 0 ? t('create.guidePlaceholder', { amount: fmt(Math.round(target / 40)) }) : '100', hint: t('create.guideHint') })}`
  } else {
    body = review(ui)
    next = btn(ui, 'create-round', t('start.create'), 'accent block', { busy: t('create.creating') })
  }

  return page(raw('create.titles')[at], `${body}<div class="actions sticky">${next}</div>`, {
    steps,
    at,
    back: at === 0 ? 'close-sheet' : 'create-back'
  })
}

function review (ui) {
  const s = ui.status
  const d = ui.draft
  const p = per(d.interval)
  const n = Math.max(1, Math.floor(num(d.installments)))
  const end = endOfDay(d.endDate)
  const interval = d.interval === 'week' ? 7 * 86400 : 30 * 86400
  const net = d.network || s.network.id
  const networks = s.networks.map((x) =>
    `<option value="${esc(x.id)}" ${x.id === net ? 'selected' : ''} ${x.ready ? '' : 'disabled'}>${esc(x.name)}${x.ready ? '' : ' ' + t('create.notReady')}</option>`).join('')
  return `<div class="receipt">
      <div class="receipt-head"><span class="small muted">${t('create.round')}</span><strong>${esc(d.title)}</strong>${d.website ? `<span class="small muted">${esc(d.website)}</span>` : ''}</div>
      <dl>
        <dt>${t('create.payment')}</dt><dd>${t('mode.' + (d.mode === 'deposit' ? 'deposit' : 'invoice'))}</dd>
        <dt>${t('create.bidUntil')}</dt><dd>${esc(dayTime(end))}</dd>
        <dt>${t('create.goal')}</dt><dd><strong>${fmt(num(d.target))} USDT ${p.per}</strong></dd>
        <dt>${t('create.invoices')}</dt><dd>${n} × ${p.adj}</dd>
        <dt>${t('create.period')}</dt><dd>${n === 1 ? esc(date(end)) : `${esc(date(end))} – ${esc(date(end + interval * (n - 1)))}`}</dd>
        <dt>${t('create.together')}</dt><dd>${fmt(num(d.target) * n)} USDT</dd>
        ${num(d.minBid) > 0 ? `<dt>${t('label.minBid')}</dt><dd>${fmt(num(d.minBid))} USDT</dd>` : ''}
        ${num(d.guide) > 0 ? `<dt>${t('label.guide')}</dt><dd>${fmt(num(d.guide))} USDT</dd>` : ''}
      </dl>
    </div>
    <div><label for="network">${t('create.network')}</label><select class="field" id="network" data-draft="network">${networks}</select></div>
    <label class="switch"><input type="checkbox" data-draft="inviteOnly" ${d.inviteOnly ? 'checked' : ''}> ${t('create.inviteOnly')}</label>
    <p class="small muted">${t('create.reviewNote')}</p>`
}

export function joinPage (ui) {
  const camera = ui.joinScan
    ? `<div class="scanner"><div id="scanner-slot"></div><div class="scanner-frame"></div></div>
       <p class="small muted" style="text-align:center">${t('join.hold')}</p>`
    : ''
  return page(t('start.join'), `
    <p class="lead">${t('join.lead')}</p>
    <button class="btn ghost block" data-action="join-scan">${ICON.qr}<span>${ui.joinScan ? t('join.closeCamera') : t('join.scan')}</span></button>
    ${camera}
    ${ui.scanError ? `<p class="small muted">${esc(ui.scanError)}</p>` : ''}
    <div class="or"><span>${t('join.or')}</span></div>
    ${field(ui, 'link', t('label.invite'), { area: true, mono: true, placeholder: 'pomona://…' })}
    <p class="small muted">${t('join.note')}</p>
    <div class="actions sticky">${btn(ui, 'join', t('join.join'), 'accent block', { busy: t('join.searching') })}</div>`)
}
