/**
 * Small building blocks shared by all views.
 * @module ui/views/parts
 */
import { esc } from '../format.js'
import { t } from '../../i18n/index.js'

export const PEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 7c-1.6 0-2.6 1.3-2.9 2.8-.3 1.6-1.1 2.3-2 3.3A5.3 5.3 0 0 0 12 21.5a5.3 5.3 0 0 0 4.9-8.4c-.9-1-1.7-1.7-2-3.3C14.6 8.3 13.6 7 12 7Z"/>
  <path d="M12 7V3.5"/><path d="M12 4.5c1.2-1.4 2.8-1.6 4-1.2-.5 1.5-2 2.4-4 2.2"/></svg>`

export const spinner = '<span class="spinner"></span>'

/**
 * A button bound to an action in app.js. Disabled while any action runs.
 * @param {object} ui - UI state
 * @param {string} action
 * @param {string} label
 * @param {string} [cls]
 * @param {{ disabled?: boolean, busy?: string, data?: Record<string,string> }} [o]
 */
export function btn (ui, action, label, cls = '', o = {}) {
  const busy = ui.pending === action
  const step = { sign: t('common.sending'), confirm: t('common.confirming') }[ui.status?.busyStep]
  const off = o.disabled || !!ui.pending || !!ui.status?.busy
  const data = Object.entries(o.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')
  return `<button class="btn ${cls}" data-action="${action}"${data} ${off ? 'disabled' : ''}>${busy ? spinner + ' ' + esc(step || o.busy || t('common.wait')) : esc(label)}</button>`
}

/** A text-style button. */
export function link (ui, action, label, cls = '', data = {}) {
  const d = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')
  return `<button class="link ${cls}" data-action="${action}"${d} ${ui.pending ? 'disabled' : ''}>${esc(label)}</button>`
}

/** A labelled input bound to ui.draft[key]. */
export function field (ui, key, label, { type = 'text', placeholder = '', mode = '', area = false, mono = false, hint = '' } = {}) {
  const v = esc(ui.draft[key])
  const attrs = `class="field${mono ? ' mono' : ''}" id="${key}" data-draft="${key}" placeholder="${esc(placeholder)}"${mode ? ` inputmode="${mode}"` : ''}`
  const input = area ? `<textarea ${attrs}>${v}</textarea>` : `<input ${attrs} type="${type}" value="${v}" autocomplete="off">`
  const help = hint ? `<p class="field-hint small muted" id="${key}-hint">${esc(hint)}</p>` : ''
  return `<div><label for="${key}">${esc(label)}</label>${hint ? input.replace(' autocomplete', ` aria-describedby="${key}-hint" autocomplete`) : input}${help}</div>`
}

/**
 * A full page for one step of a flow ("one step, one page"). Replaces the
 * main view while open; works the same on desktop and mobile.
 *
 * @param {string|null} title
 * @param {string} body
 * @param {Object} [o]
 * @param {string[]} [o.steps] - labels of all steps of the flow, shown on top
 * @param {number} [o.at]      - index of the current step
 * @param {string|false} [o.back] - action of the back button, false hides it
 */
export function page (title, body, { steps = null, at = 0, back = 'close-sheet', cls = '' } = {}) {
  const bar = steps
    ? `<ol class="stepbar" aria-label="${t('common.stepOf', { at: at + 1, n: steps.length })}">${steps.map((label, i) =>
        `<li class="${i < at ? 'done' : i === at ? 'now' : 'todo'}" ${i === at ? 'aria-current="step"' : ''}><span>${i < at ? '✓' : i + 1}</span>${esc(label)}</li>`).join('')}</ol>`
    : ''
  return `<section class="page ${cls}">
    <div class="page-top">
      ${back ? `<button class="link back" data-action="${back}">${t('common.back')}</button>` : '<span></span>'}
    </div>
    ${bar}
    ${title ? `<h1 class="page-title">${esc(title)}</h1>` : ''}
    <div class="stack-lg">${body}</div>
  </section>`
}
