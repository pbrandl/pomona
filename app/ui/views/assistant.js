/**
 * "Frag Pomona": a conversation page on top of the app. Answers explain;
 * action cards open the matching page of the app, where the person confirms.
 * @module ui/views/assistant
 */
import { esc } from '../format.js'
import { spinner } from './parts.js'

/** "Frag Pomona": a plain round speech bubble. */
export const SPARK = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20.5 11.5a8 8 0 0 1-11.9 7l-4.6 1.4 1.4-4.4a8 8 0 1 1 15.1-4z"/></svg>`

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

/** Index from which messages are new (they glide in once); set by app.js. */
let animFrom = Infinity
export function markNew (from) { animFrom = from }

function bubble (m, i) {
  const fresh = i >= animFrom ? ' new' : ''
  if (m.role === 'user') return `<div class="msg user${fresh}"><p>${esc(m.text)}</p></div>`
  const cards = (m.actions || []).map((a, j) =>
    `<button class="action-card" data-action="agent-act" data-msg="${i}" data-act="${j}"><span>${esc(a.label)}</span><span class="chev">›</span></button>`).join('')
  const note = m.actions?.some((a) => a.type !== 'install' && a.type !== 'open' && a.type !== 'receipt')
    ? '<p class="small muted">Vorbereitet. Bestätigen musst du selbst.</p>'
    : ''
  const source = m.source === 'model' ? '<p class="tiny muted">Lokale KI · kann sich irren</p>' : ''
  return `<div class="msg bot${fresh}"><p>${esc(m.text)}</p>${cards ? `<div class="action-cards">${cards}</div>${note}` : ''}${source}</div>`
}

const isThinking = (ui) => ui.pending === 'agent-send' || ui.pending === 'agent-topic'

/**
 * The conversation with one quiet line about the language model on top (chat
 * page and start screen). Example questions sit as one swipeable row above
 * the field (homeChips).
 */
export function chatBody (ui) {
  const a = ui.status.assistant
  const thinking = isThinking(ui)
  let model = ''
  if (a?.state === 'downloading' || a?.state === 'loading') {
    model = `<p class="model-line">${spinner}<span>Sprachmodell wird ${a.state === 'loading' ? 'vorbereitet' : `geladen · ${Math.round((a.progress ?? 0) * 100)} %`}</span></p>`
  } else if (a?.manual && (a.state === 'none' || a.state === 'error')) {
    model = manualCard(a) // the manual download needs its three steps
  } else if (a?.state === 'none' || a?.state === 'error') {
    const small = (a.models || []).find((m) => m.key === 'small')
    model = `<p class="model-line">${a.state === 'error' ? `<span class="warn-text">${esc(a.error)}</span>` : '<span>Für freie Fragen läuft ein Sprachmodell lokal auf deinem Gerät.</span>'}
      <button class="link" data-action="agent-install" data-model="small">Laden${small ? ` (${esc(small.size)})` : ''}</button></p>`
  }
  return `${model}
    <div class="chat" id="chat">
      ${ui.chat.map(bubble).join('')}
      ${thinking ? '<div class="msg bot typing" aria-label="Pomona antwortet"><i></i><i></i><i></i></div>' : ''}
    </div>`
}

/** Example questions as one row that scrolls sideways. */
export function homeChips (ui) {
  const thinking = isThinking(ui)
  const list = ui.status.assistant?.suggestions || []
  if (!list.length) return ''
  return `<div class="home-chips" role="list">${list.map((s) =>
    `<button class="chip question" role="listitem" data-action="agent-topic" data-topic="${esc(s.topic)}" ${thinking ? 'disabled' : ''}>${esc(s.question)}</button>`).join('')}</div>`
}

/** The question field with the send button inside, on the right. */
export function chatInput (ui, placeholder) {
  const thinking = isThinking(ui)
  return `<div class="amount ask">
      <input id="ask" data-draft="ask" placeholder="${esc(placeholder)}" value="${esc(ui.draft.ask)}" autocomplete="off" enterkeyhint="send" aria-label="Frag Pomona">
      <button class="btn accent small" data-action="agent-send" ${thinking ? 'disabled' : ''}>Senden</button>
    </div>`
}

/**
 * The chat as a messenger: the way back sits in the bar on top, messages scroll
 * in the middle, the example questions (one swipeable row) and the field stay
 * at the bottom.
 */
export function assistantPage (ui) {
  const a = ui.status.assistant
  const hello = ui.chat.length ? '' : '<div class="msg bot"><p>Hallo! Ich erkläre dir die Runde und bereite Schritte für dich vor. Bestätigen musst du immer selbst. Was möchtest du wissen?</p></div>'
  return `<section class="chat-page">
    <div class="page-top"><button class="link back" data-action="close-sheet">← Zurück</button><!--right-->${ui.chat.length ? '<button class="link small" data-action="agent-reset">Neuer Chat</button>' : ''}</div>
    <div class="chat-scroll" id="chat-scroll">
      ${hello}
      ${chatBody(ui)}
    </div>
    <div class="chat-foot">
      ${homeChips(ui)}
      ${chatInput(ui, a?.state === 'ready' || a?.state === 'installed' ? 'Frag etwas…' : 'Frag etwas oder sag „Biete 100 im Monat“')}
    </div>
  </section>`
}
