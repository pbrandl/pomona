/**
 * No round yet: choose between starting one and joining one. Starting is a
 * four-step flow, one step per page: Runde → Bietphase → Raten → Prüfen.
 * @module ui/views/start
 */
import { esc, fmt, num, per, date, dayTime, endOfDay } from '../format.js'
import { btn, field, page } from './parts.js'

export const CREATE_STEPS = ['Runde', 'Bietphase', 'Raten', 'Prüfen']

export function start () {
  return `<div class="stack-lg">
    <div class="stack"><h1>Eine Runde, ein Ziel.</h1><p class="lead">Starte eine Bietrunde für dein Projekt oder tritt einer bei.</p></div>
    <div class="stack">
      <button class="card choice" data-action="open-create"><div><strong>Runde starten</strong><span class="muted">Für dein Projekt, z. B. eine Solawi. Dauert zwei Minuten.</span></div><span class="chev">›</span></button>
      <button class="card choice" data-action="open-sheet" data-sheet="join"><div><strong>Einer Runde beitreten</strong><span class="muted">Mit dem Link, den du bekommen hast.</span></div><span class="chev">›</span></button>
    </div>
  </div>`
}

/** Which fields belong to which step, for validation before "Weiter". */
export function createStepError (ui) {
  const d = ui.draft
  switch (ui.createStep) {
    case 0: return d.title.trim() ? null : 'Bitte gib der Runde einen Namen.'
    case 1: return endOfDay(d.endDate) > Date.now() / 1000 + 3600 ? null : 'Bitte ein Enddatum in der Zukunft wählen.'
    case 2:
      if (!(num(d.target) > 0)) return 'Bitte einen Zielbetrag angeben.'
      if (!(Math.floor(num(d.installments)) >= 1)) return 'Bitte die Anzahl der Rechnungen angeben.'
      return null
    default: return null
  }
}

export function createPage (ui) {
  const d = ui.draft
  const p = per(d.interval)
  const at = ui.createStep
  let body = ''
  let next = btn(ui, 'create-next', 'Weiter', 'accent block')

  if (at === 0) {
    body = `${field(ui, 'title', 'Name der Runde', { placeholder: 'Solawi Lindenhof 2027' })}
      ${field(ui, 'description', 'Worum geht es? (optional)', { area: true, placeholder: 'Gemüse für 40 Haushalte, April bis März.' })}`
  } else if (at === 1) {
    body = `<p class="lead">Bis wann darf geboten werden? Bis dahin können alle bieten, erhöhen und zurückziehen.</p>
      ${field(ui, 'endDate', 'Bieten möglich bis einschließlich', { type: 'date' })}
      ${field(ui, 'minBid', `Mindestgebot ${p.per} (optional)`, { mode: 'decimal', placeholder: '0' })}`
  } else if (at === 2) {
    const target = num(d.target)
    body = `<p class="lead">Nach der Bietphase stellst du Rate für Rate eine Rechnung.</p>
      <div>
        <label>Abrechnung</label>
        <div class="tabs">
          <button class="${d.interval === 'week' ? 'on' : ''}" data-action="interval" data-interval="week">Wöchentlich</button>
          <button class="${d.interval === 'month' ? 'on' : ''}" data-action="interval" data-interval="month">Monatlich</button>
        </div>
      </div>
      ${field(ui, 'target', `Ziel ${p.per} (USDT)`, { mode: 'decimal', placeholder: '4.000' })}
      ${field(ui, 'installments', 'Anzahl Rechnungen', { mode: 'numeric', placeholder: '12' })}
      ${field(ui, 'guide', `Richtwert ${p.per} (optional)`, { mode: 'decimal', placeholder: target > 0 ? `z. B. ${fmt(Math.round(target / 40))} bei 40 Haushalten` : '100' })}
      <p class="small muted" style="margin-top:-16px">Wird Bietenden als Orientierung vorgeschlagen.</p>`
  } else {
    body = review(ui)
    next = btn(ui, 'create-round', 'Runde starten', 'accent block', { busy: 'Runde wird angelegt…' })
  }

  return page(CREATE_STEPS[at] === 'Prüfen' ? 'Alles richtig?' : titleFor(at), `${body}<div class="actions sticky">${next}</div>`, {
    steps: CREATE_STEPS,
    at,
    back: at === 0 ? 'close-sheet' : 'create-back'
  })
}

function titleFor (at) {
  return ['Deine Runde', 'Bietphase', 'Ratenzahlung'][at]
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
    `<option value="${esc(x.id)}" ${x.id === net ? 'selected' : ''} ${x.ready ? '' : 'disabled'}>${esc(x.name)}${x.ready ? '' : ' (nicht eingerichtet)'}</option>`).join('')
  return `<div class="receipt">
      <div class="receipt-head"><span class="small muted">Runde</span><strong>${esc(d.title)}</strong>${d.description ? `<span class="small muted">${esc(d.description)}</span>` : ''}</div>
      <dl>
        <dt>Bieten bis</dt><dd>${esc(dayTime(end))}</dd>
        <dt>Ziel</dt><dd><strong>${fmt(num(d.target))} USDT ${p.per}</strong></dd>
        <dt>Rechnungen</dt><dd>${n} × ${p.adj}</dd>
        <dt>Zeitraum</dt><dd>${n === 1 ? esc(date(end)) : `${esc(date(end))} – ${esc(date(end + interval * (n - 1)))}`}</dd>
        <dt>Zusammen</dt><dd>${fmt(num(d.target) * n)} USDT</dd>
        ${num(d.minBid) > 0 ? `<dt>Mindestgebot</dt><dd>${fmt(num(d.minBid))} USDT</dd>` : ''}
        ${num(d.guide) > 0 ? `<dt>Richtwert</dt><dd>${fmt(num(d.guide))} USDT</dd>` : ''}
      </dl>
    </div>
    <div><label for="network">Netzwerk</label><select class="field" id="network" data-draft="network">${networks}</select></div>
    <label class="switch"><input type="checkbox" data-draft="inviteOnly" ${d.inviteOnly ? 'checked' : ''}> Nur mit Einladungslink bieten</label>
    <p class="small muted">Danach bekommst du einen Link zum Teilen. Die Angaben oben stehen dann unveränderlich fest.</p>`
}

export function joinPage (ui) {
  return page('Einer Runde beitreten', `
    <p class="lead">Füge den Link ein, den du vom Organisator bekommen hast.</p>
    ${field(ui, 'link', 'Einladungslink', { area: true, mono: true, placeholder: 'pomona://…' })}
    <p class="small muted">Die Runde wird direkt von anderen Teilnehmern geladen, ohne Server. Pomona prüft, dass die Runde echt ist.</p>
    <div class="actions sticky">${btn(ui, 'join', 'Beitreten', 'accent block', { busy: 'Suche Peers…' })}</div>`)
}
