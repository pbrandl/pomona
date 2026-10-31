/**
 * Start screen: create a round or join one with a link.
 * @module ui/views/start
 */
import { esc, fmt, num, per } from '../format.js'
import { btn, field } from './parts.js'

export function start (ui) {
  const tabs = `<div class="tabs">
    <button class="${ui.tab === 'create' ? 'on' : ''}" data-action="tab" data-tab="create">Runde starten</button>
    <button class="${ui.tab === 'join' ? 'on' : ''}" data-action="tab" data-tab="join">Beitreten</button>
  </div>`
  return `<div class="stack-lg">
    <div class="stack"><h1>Eine Runde, ein Ziel.</h1><p class="lead">Starte eine Bietrunde für dein Projekt oder tritt einer bei.</p></div>
    <div class="stack">${tabs}${ui.tab === 'create' ? createForm(ui) : joinForm(ui)}</div>
  </div>`
}

function createForm (ui) {
  const s = ui.status
  const d = ui.draft
  const p = per(d.interval)
  const net = d.network || s.network.id
  const networks = s.networks.map((n) =>
    `<option value="${esc(n.id)}" ${n.id === net ? 'selected' : ''} ${n.ready ? '' : 'disabled'}>${esc(n.name)}${n.ready ? '' : ' (nicht eingerichtet)'}</option>`).join('')
  const n = Math.max(0, Math.floor(num(d.installments)))
  const target = num(d.target)
  const summary = target > 0 && n > 0
    ? `Ziel: ${fmt(target)} USDT ${p.per}, ${n} ${n === 1 ? 'Rechnung' : 'Rechnungen'} – zusammen ${fmt(target * n)} USDT.`
    : 'Bietende hinterlegen ihr Gebot für alle Raten. Du rechnest Rate für Rate ab.'

  return `<div class="card stack">
    ${field(ui, 'title', 'Name der Runde', { placeholder: 'Solawi Lindenhof 2027' })}
    ${field(ui, 'description', 'Worum geht es?', { area: true, placeholder: 'Gemüse für 40 Haushalte, April bis März.' })}
    <div>
      <label>Abrechnung</label>
      <div class="tabs">
        <button class="${d.interval === 'week' ? 'on' : ''}" data-action="interval" data-interval="week">Wöchentlich</button>
        <button class="${d.interval === 'month' ? 'on' : ''}" data-action="interval" data-interval="month">Monatlich</button>
      </div>
    </div>
    <div class="grid2">
      ${field(ui, 'target', `Ziel ${p.per} (USDT)`, { mode: 'decimal', placeholder: '4.000' })}
      ${field(ui, 'installments', 'Anzahl Rechnungen', { mode: 'numeric', placeholder: '12' })}
    </div>
    <div class="grid2">
      ${field(ui, 'minBid', `Mindestgebot ${p.per}`, { mode: 'decimal', placeholder: '0' })}
      ${field(ui, 'days', 'Bietphase (Tage)', { mode: 'numeric' })}
    </div>
    <div><label for="network">Netzwerk</label><select class="field" id="network" data-draft="network">${networks}</select></div>
    <label class="switch"><input type="checkbox" data-draft="inviteOnly" ${d.inviteOnly ? 'checked' : ''}> Nur mit Einladungslink bieten</label>
    <p class="small muted">${esc(summary)}</p>
    ${btn(ui, 'create-round', 'Runde starten', 'accent block', { busy: 'Contract wird angelegt…' })}
  </div>`
}

function joinForm (ui) {
  return `<div class="card stack">
    ${field(ui, 'link', 'Einladungslink', { area: true, mono: true, placeholder: 'pomona://…' })}
    ${btn(ui, 'join', 'Beitreten', 'accent block', { busy: 'Suche Peers…' })}
    <p class="small muted">Die Runde wird direkt von anderen Teilnehmern geladen, ohne Server. Pomona prüft, dass der Contract echt ist.</p>
  </div>`
}
