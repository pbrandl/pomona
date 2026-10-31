/**
 * Small building blocks shared by all views.
 * @module ui/views/parts
 */
import { esc } from '../format.js'

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
  const step = { sign: 'Wird gesendet…', confirm: 'Wird bestätigt…' }[ui.status?.busyStep]
  const off = o.disabled || !!ui.pending || !!ui.status?.busy
  const data = Object.entries(o.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')
  return `<button class="btn ${cls}" data-action="${action}"${data} ${off ? 'disabled' : ''}>${busy ? spinner + ' ' + esc(step || o.busy || 'Bitte warten…') : esc(label)}</button>`
}

/** A text-style button. */
export function link (ui, action, label, cls = '', data = {}) {
  const d = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')
  return `<button class="link ${cls}" data-action="${action}"${d} ${ui.pending ? 'disabled' : ''}>${esc(label)}</button>`
}

/** A labelled input bound to ui.draft[key]. */
export function field (ui, key, label, { type = 'text', placeholder = '', mode = '', area = false, mono = false } = {}) {
  const v = esc(ui.draft[key])
  const attrs = `class="field${mono ? ' mono' : ''}" id="${key}" data-draft="${key}" placeholder="${esc(placeholder)}"${mode ? ` inputmode="${mode}"` : ''}`
  const input = area ? `<textarea ${attrs}>${v}</textarea>` : `<input ${attrs} type="${type}" value="${v}" autocomplete="off">`
  return `<div><label for="${key}">${esc(label)}</label>${input}</div>`
}

/** Sheet (side panel) wrapper. `dismiss` = clicking the backdrop closes it. */
export function sheet (title, body, { dismiss = true, close = true } = {}) {
  return `<div class="sheet-backdrop" ${dismiss ? 'data-action="close-sheet"' : ''}><aside class="sheet stack-lg" data-stop>
    ${title ? `<div class="row"><h2 style="margin:0">${esc(title)}</h2>${close ? '<button class="link" data-action="close-sheet">Schließen</button>' : ''}</div>` : ''}
    ${body}
  </aside></div>`
}
