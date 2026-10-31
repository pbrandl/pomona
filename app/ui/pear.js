/**
 * Backend bridge inside Pear: starts the Bare worker with pear-run and speaks
 * newline-delimited JSON-RPC over its pipe (see core/rpc/server.js).
 * Exposes `window.pomona = { call, on, copy }`.
 * @module ui/pear
 */
import run from 'pear-run'

const pipe = run(Pear.config.applink + '/worker/index.js')
const pending = new Map()
const listeners = new Map()
const decoder = new TextDecoder()
let nextId = 1
let buf = ''

pipe.on('data', (chunk) => {
  buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.event) {
      for (const fn of listeners.get(msg.event) || []) fn(msg.data)
      continue
    }
    const p = pending.get(msg.id)
    if (!p) continue
    pending.delete(msg.id)
    if (msg.error) p.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }))
    else p.resolve(msg.result)
  }
})

window.pomona = {
  call (method, params = {}) {
    const id = nextId++
    pipe.write(JSON.stringify({ id, method, params }) + '\n')
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  },
  on (event, fn) {
    if (!listeners.has(event)) listeners.set(event, [])
    listeners.get(event).push(fn)
  },
  copy (text) {
    return navigator.clipboard.writeText(text)
  }
}
window.dispatchEvent(new Event('pomona:backend'))
