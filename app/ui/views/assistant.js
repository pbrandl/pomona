/**
 * "Frag Pomona": a conversation page on top of the app. Answers explain;
 * action cards open the matching page of the app, where the person confirms.
 * @module ui/views/assistant
 */
import { esc } from '../format.js'
import { page, spinner } from './parts.js'

export const SPARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/>
  <path d="M12 6.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/></svg>`

/** Model setup / download state; quiet once the model is there. */
function modelCard (ui) {
  const a = ui.status.assistant
  if (!a) return ''
  if (a.state === 'downloading' || a.state === 'loading') {
    const pct = Math.round((a.progress ?? 0) * 100)
    const title = a.state === 'loading' ? 'Sprachmodell wird vorbereitet…' : a.manual ? 'Modelldatei wird geprüft' : 'Sprachmodell wird geladen'
    const note = a.manual ? 'Einmalig: Pomona vergleicht die Prüfsumme mit dem QVAC-Katalog.' : 'Einmalig, direkt von anderen Rechnern (peer-to-peer). Du kannst Pomona solange weiter nutzen.'
    return `<div class="card-inset stack">
      <div class="row"><strong>${title}</strong><span class="small muted">${a.state === 'loading' ? '' : pct + ' %'}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <p class="small muted">${note}</p>
    </div>`
  }
  if ((a.state === 'none' || a.state === 'error') && a.manual) return manualCard(a)
  if (a.state === 'none' || a.state === 'error') {
    const options = a.models.map((m) =>
      `<button class="btn ${m.key === 'small' ? 'accent' : 'ghost'} block" data-action="agent-install" data-model="${esc(m.key)}">${esc(m.label)} · ${esc(m.size)}</button>`).join('')
    return `<div class="card-inset stack">
      ${a.state === 'error' ? `<p class="warn-text small">${esc(a.error)}</p>` : ''}
      <p><strong>Für freie Fragen</strong> lädt Pomona einmalig ein Sprachmodell auf dein Gerät. Es läuft dann offline: Deine Fragen verlassen das Gerät nicht.</p>
      <div class="actions">${options}</div>
      <p class="small muted">Die Vorschläge unten funktionieren auch ohne.</p>
    </div>`
  }
  return ''
}

/**
 * Setup without peer-to-peer (developer mode, firewalls): download the file in
 * the browser, move it into the folder, then set up. Three short steps.
 */
function manualCard (a) {
  const m = a.models.find((x) => x.key === 'small') || a.models[0]
  if (!m) return ''
  const problem = a.state !== 'error'
    ? ''
    : a.missing
      ? '<p class="warn-text small">Noch nicht gefunden. Liegt die Datei noch in Downloads? Bitte in den Ordner oben verschieben und erneut prüfen.</p>'
      : `<p class="warn-text small">${esc(a.error)}</p>`
  return `<div class="card-inset stack">
    <p><strong>Für freie Fragen</strong> braucht Pomona einmalig ein Sprachmodell (${esc(m.size)}). Es läuft dann offline: Deine Fragen verlassen das Gerät nicht.</p>
    <ol class="setup-steps">
      <li><span class="setup-n">1</span><div class="stack-sm">
        <strong>Herunterladen</strong>
        <a class="btn ghost small" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.file)} · ${esc(m.size)}</a>
      </div></li>
      <li><span class="setup-n">2</span><div class="stack-sm">
        <strong>In diesen Ordner legen</strong>
        <div class="setup-path"><span class="mono small">${esc(a.manual.dir)}</span><button class="link small" data-action="copy-models-dir">Kopieren</button></div>
      </div></li>
      <li><span class="setup-n">3</span><div class="stack-sm">
        <button class="btn accent block" data-action="agent-install" data-model="${esc(m.key)}">${a.missing ? 'Erneut prüfen' : 'Einrichten'}</button>
      </div></li>
    </ol>
    ${problem}
    <p class="small muted">Die Vorschläge unten funktionieren auch ohne.</p>
  </div>`
}

function bubble (m, i) {
  if (m.role === 'user') return `<div class="msg user"><p>${esc(m.text)}</p></div>`
  const cards = (m.actions || []).map((a, j) =>
    `<button class="action-card" data-action="agent-act" data-msg="${i}" data-act="${j}"><span>${esc(a.label)}</span><span class="chev">›</span></button>`).join('')
  const note = m.actions?.some((a) => a.type !== 'install' && a.type !== 'open' && a.type !== 'receipt')
    ? '<p class="small muted">Vorbereitet. Bestätigen musst du selbst.</p>'
    : ''
  const source = m.source === 'model' ? '<p class="tiny muted">Lokale KI · kann sich irren</p>' : ''
  return `<div class="msg bot"><p>${esc(m.text)}</p>${cards ? `<div class="action-cards">${cards}</div>${note}` : ''}${source}</div>`
}

export function assistantPage (ui) {
  const a = ui.status.assistant
  const chat = ui.chat
  const thinking = ui.pending === 'agent-send' || ui.pending === 'agent-topic'
  const intro = chat.length
    ? ''
    : '<div class="msg bot"><p>Hallo! Ich erkläre dir die Runde und bereite Schritte für dich vor. Bestätigen musst du immer selbst. Was möchtest du wissen?</p></div>'
  const chips = (a?.suggestions || []).map((s) =>
    `<button class="chip question" data-action="agent-topic" data-topic="${esc(s.topic)}" ${thinking ? 'disabled' : ''}>${esc(s.question)}</button>`).join('')

  return page('Frag Pomona', `
    ${modelCard(ui)}
    <div class="chat" id="chat">
      ${intro}
      ${chat.map(bubble).join('')}
      ${thinking ? `<div class="msg bot thinking">${spinner}<span>${a?.state === 'ready' || a?.state === 'installed' ? 'Denkt nach…' : 'Einen Moment…'}</span></div>` : ''}
    </div>
    <div class="chips">${chips}</div>
    <div class="actions sticky">
      <div class="amount ask">
        <input id="ask" data-draft="ask" placeholder="${a?.state === 'none' ? 'Frag etwas oder sag z. B. „Biete 100 im Monat“' : 'Frag etwas…'}" value="${esc(ui.draft.ask)}" autocomplete="off" ${thinking ? 'disabled' : ''}>
        <button class="btn accent small" data-action="agent-send" ${thinking ? 'disabled' : ''}>Senden</button>
      </div>
      ${chat.length ? '<button class="link small" data-action="agent-reset" style="align-self:center">Neu beginnen</button>' : ''}
    </div>`)
}
