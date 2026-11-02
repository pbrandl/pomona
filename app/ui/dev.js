/**
 * Backend bridge for the developer mode without Pear (`npm run dev`).
 * Same interface as ui/pear.js: `window.pomona = { call, on, copy, cameraAccess, restart }`.
 *
 * Calls go as POST /rpc to the local dev server (scripts/dev.js), which hands
 * them to the Bare worker. Events arrive as Server-Sent Events from /events.
 * Every request carries the session token from the start URL, so other
 * websites in the same browser cannot reach the wallet.
 * @module ui/dev
 */
const KEY = 'pomona-dev-token'
const fromUrl = new URLSearchParams(window.location.hash.slice(1)).get('t')
if (fromUrl) {
  try { window.sessionStorage.setItem(KEY, fromUrl) } catch {}
  window.history.replaceState(null, '', window.location.pathname) // keep the token out of the address bar
}
let token = fromUrl
try { token = token || window.sessionStorage.getItem(KEY) } catch {}

const listeners = new Map()
const emit = (event, data) => { for (const fn of listeners.get(event) || []) fn(data) }

if (token) {
  const es = new window.EventSource('/events?t=' + encodeURIComponent(token))
  es.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg.event) emit(msg.event, msg.data)
  }
}

window.pomona = {
  async call (method, params = {}) {
    if (!token) throw Object.assign(new Error('Bitte Pomona über den Link aus dem Terminal öffnen.'), { code: 'NO_TOKEN' })
    let res
    try {
      res = await fetch('/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pomona-token': token },
        body: JSON.stringify({ method, params })
      })
    } catch {
      throw Object.assign(new Error('Pomona läuft nicht mehr. Bitte im Terminal neu starten.'), { code: 'OFFLINE' })
    }
    const msg = await res.json().catch(() => ({ error: { code: 'ERROR', message: 'Ungültige Antwort.' } }))
    if (msg.error) throw Object.assign(new Error(msg.error.message), { code: msg.error.code })
    return msg.result
  },
  on (event, fn) {
    if (!listeners.has(event)) listeners.set(event, [])
    listeners.get(event).push(fn)
  },
  copy (text) {
    return navigator.clipboard.writeText(text)
  },
  async cameraAccess () {
    return true // the browser asks on getUserMedia
  },
  restart () {
    window.location.reload()
  }
}

window.dispatchEvent(new Event('pomona:backend'))
