/**
 * "Frag Pomona": a conversation page on top of the app. Answers explain;
 * action cards open the matching page of the app, where the person confirms.
 * @module ui/views/assistant
 */
import { esc, fmt } from '../format.js'
import { spinner } from './parts.js'
import { t } from '../../i18n/index.js'

/** Model size in GB, with the decimal separator of the selected language. */
const gb = (n) => `${fmt(n, 1)} GB`

/** "Frag Pomona": a plain round speech bubble. */
export const SPARK = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20.5 11.5a8 8 0 0 1-11.9 7l-4.6 1.4 1.4-4.4a8 8 0 1 1 15.1-4z"/></svg>`

/**
 * Setup without peer-to-peer (developer mode, firewalls): download the file in
 * the browser, move it into the folder, then set up. Three short steps.
 */
function manualCard (a, ui) {
  const m = a.models.find((x) => x.key === 'small') || a.models[0]
  if (!m) return ''
  const problem = a.state !== 'error'
    ? ''
    : a.missing
      ? `<p class="warn-text small">${t('assistant.notFound')}</p>`
      : `<p class="warn-text small">${esc(a.error)}</p>`
  return `<div class="card-inset stack">
    <p>${t('assistant.needModel', { size: gb(m.size) })}</p>
    <ol class="setup-steps">
      <li><span class="setup-n">1</span><div class="stack-sm">
        <strong>${t('assistant.download')}</strong>
        <a class="btn ghost small" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.file)} · ${gb(m.size)}</a>
      </div></li>
      <li><span class="setup-n">2</span><div class="stack-sm">
        <strong>${t('assistant.putInFolder')}</strong>
        <div class="setup-path"><span class="mono small">${esc(a.manual.dir)}</span><button class="link small" data-action="copy-models-dir">${t('assistant.copy')}</button>${ui?.canPickModel ? `<button class="link small" data-action="agent-pick">${t('assistant.change')}</button>` : ''}</div>
      </div></li>
      <li><span class="setup-n">3</span><div class="stack-sm">
        <button class="btn accent block" data-action="agent-install" data-model="${esc(m.key)}">${a.missing ? t('assistant.checkAgain') : t('assistant.setUp')}</button>
      </div></li>
    </ol>
    ${problem}
    <p class="small muted">${t('assistant.withoutModel')}</p>
  </div>`
}

/** Desktop only: choose a model file (or folder) with the system dialog. */
const pick = (ui, label) => ui.canPickModel ? `<button class="link" data-action="agent-pick">${label}</button>` : ''

/** Index from which messages are new (they glide in once); set by app.js. */
let animFrom = Infinity
export function markNew (from) { animFrom = from }

function bubble (m, i) {
  const fresh = i >= animFrom ? ' new' : ''
  if (m.role === 'user') return `<div class="msg user${fresh}"><p>${esc(m.text)}</p></div>`
  const cards = (m.actions || []).map((a, j) =>
    `<button class="action-card" data-action="agent-act" data-msg="${i}" data-act="${j}"><span>${esc(a.label)}</span><span class="chev">›</span></button>`).join('')
  const note = m.actions?.some((a) => a.type !== 'install' && a.type !== 'open' && a.type !== 'receipt')
    ? `<p class="small muted">${t('assistant.prepared')}</p>`
    : ''
  const source = m.source === 'model' ? `<p class="tiny muted">${t('assistant.localAi')}</p>` : ''
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
    model = `<p class="model-line">${spinner}<span>${a.state === 'loading' ? t('assistant.preparing') : t(a.manual ? 'assistant.checking' : 'assistant.loading', { pct: Math.round((a.progress ?? 0) * 100) })}</span>${a.state === 'downloading' && !a.manual ? pick(ui, t('assistant.stuck')) : ''}</p>`
  } else if (a?.manual && (a.state === 'none' || a.state === 'error')) {
    model = manualCard(a, ui) // the manual download needs its three steps
  } else if (a?.state === 'none' || a?.state === 'error') {
    const small = (a.models || []).find((m) => m.key === 'small')
    model = `<p class="model-line">${a.state === 'error' ? `<span class="warn-text">${esc(a.error)}</span>` : `<span>${t('assistant.local')}</span>`}
      <button class="link" data-action="agent-install" data-model="small">${t('assistant.load')}${small ? ` (${gb(small.size)})` : ''}</button>${pick(ui, t('assistant.pick'))}</p>`
  }
  return `${model}
    <div class="chat" id="chat">
      ${ui.chat.map(bubble).join('')}
      ${thinking ? `<div class="msg bot typing" aria-label="${t('assistant.typing')}"><i></i><i></i><i></i></div>` : ''}
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
      <input id="ask" data-draft="ask" placeholder="${esc(placeholder)}" value="${esc(ui.draft.ask)}" autocomplete="off" enterkeyhint="send" aria-label="${t('assistant.title')}">
      <button class="btn accent small" data-action="agent-send" ${thinking ? 'disabled' : ''}>${t('wallet.send')}</button>
    </div>`
}

/**
 * The chat as a messenger: the way back sits in the bar on top, messages scroll
 * in the middle, the example questions (one swipeable row) and the field stay
 * at the bottom.
 */
export function assistantPage (ui) {
  const a = ui.status.assistant
  const hello = ui.chat.length ? '' : `<div class="msg bot"><p>${t('assistant.hello')}</p></div>`
  return `<section class="chat-page">
    <div class="page-top"><button class="link back" data-action="close-sheet">${t('common.back')}</button><!--right-->${ui.chat.length ? `<button class="link small" data-action="agent-reset">${t('assistant.newChat')}</button>` : ''}</div>
    <div class="chat-scroll" id="chat-scroll">
      ${hello}
      ${chatBody(ui)}
    </div>
    <div class="chat-foot">
      ${homeChips(ui)}
      ${chatInput(ui, a?.state === 'ready' || a?.state === 'installed' ? t('assistant.askShort') : t('assistant.askHint'))}
    </div>
  </section>`
}
