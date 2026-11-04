/**
 * Backend bridge in the desktop app (Electron + pear-runtime): the main
 * process starts the Bare worker (worker/index.js); the UI speaks
 * newline-delimited JSON-RPC with it through the preload bridge
 * (electron/preload.cjs, see core/rpc/server.js).
 * Exposes `window.pomona = { call, on, copy, cameraAccess, pickModel, restart }`.
 * @module ui/electron
 */
import { t } from '../i18n/index.js'

const bridge = window.bridge
const pending = new Map()
const listeners = new Map()
const emit = (event, data) => { for (const fn of listeners.get(event) || []) fn(data) }
let nextId = 1
let buf = ''

bridge.onData((text) => {
  buf += text
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.event) { emit(msg.event, msg.data); continue }
    const p = pending.get(msg.id)
    if (!p) continue
    pending.delete(msg.id)
    if (msg.error) p.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }))
    else p.resolve(msg.result)
  }
})

bridge.onExit((code) => {
  const error = new Error(t('app.workerExit', { code }))
  for (const p of pending.values()) p.reject(error)
  pending.clear()
  emit('error', error.message)
})

const started = bridge.start()

window.pomona = {
  call (method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      started.then(() => bridge.write(JSON.stringify({ id, method, params }) + '\n'))
    })
  },
  on (event, fn) {
    if (!listeners.has(event)) listeners.set(event, [])
    listeners.get(event).push(fn)
  },
  copy: (text) => bridge.copy(text),
  /** Asks the OS for camera access (needed on macOS) before getUserMedia. */
  cameraAccess: () => bridge.cameraAccess(),
  /** Model file or folder via the system dialog; the path, or null. */
  pickModel: () => bridge.pickModel(t('assistant.pickTitle')),
  restart: () => bridge.relaunch()
}

window.dispatchEvent(new Event('pomona:backend'))
