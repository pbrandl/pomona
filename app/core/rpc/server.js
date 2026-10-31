/**
 * Newline-delimited JSON-RPC over a duplex stream (the pear-pipe between the
 * UI and the worker).
 *
 *   request  {"id":1,"method":"bid","params":{"amount":"100"}}
 *   reply    {"id":1,"result":…} | {"id":1,"error":{"code":"…","message":"…"}}
 *   event    {"event":"change"}
 *
 * Only methods listed in methods.js are reachable, and their params are
 * validated against a small schema before the core sees them.
 *
 * @module core/rpc/server
 */
import { LIMITS } from '../config/limits.js'

/**
 * @param {import('stream').Duplex} stream
 * @param {object} app - the Pomona instance
 * @param {Record<string, import('./methods.js').MethodSpec>} methods
 * @returns {{ emit: (event: string, data?: unknown) => void }}
 */
export function serve (stream, app, methods) {
  let buf = ''
  const decoder = new TextDecoder()
  const send = (msg) => {
    try { stream.write(JSON.stringify(msg) + '\n') } catch {}
  }

  stream.on('data', (chunk) => {
    buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    if (buf.length > LIMITS.rpcLine && buf.indexOf('\n') === -1) buf = '' // drop oversized garbage
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      if (line.trim()) handle(line)
    }
  })

  async function handle (line) {
    let req
    try { req = JSON.parse(line) } catch { return }
    if (!req || typeof req !== 'object' || !Number.isInteger(req.id)) return
    const spec = Object.hasOwn(methods, req.method) ? methods[req.method] : null
    if (!spec) return send({ id: req.id, error: { code: 'NO_METHOD', message: 'Unbekannte Methode.' } })
    try {
      const params = validate(spec.params || {}, req.params)
      const result = await spec.run(app, params)
      send({ id: req.id, result: result ?? null })
    } catch (e) {
      send({ id: req.id, error: { code: e?.code || 'ERROR', message: e?.message || String(e) } })
    }
  }

  return { emit: (event, data) => send({ event, data }) }
}

/**
 * @param {Record<string, import('./methods.js').ParamType>} schema
 * @param {unknown} params
 */
export function validate (schema, params) {
  params = params ?? {}
  if (typeof params !== 'object' || Array.isArray(params)) throw Object.assign(new Error('Ungültige Parameter.'), { code: 'BAD_PARAMS' })
  const out = {}
  for (const [key, type] of Object.entries(schema)) {
    const v = params[key]
    if (v === undefined || v === null) continue
    const [kind, max] = Array.isArray(type) ? type : [type]
    if (kind === 'string' && typeof v === 'string' && v.length <= (max ?? 1024)) out[key] = v
    else if (kind === 'number' && typeof v === 'number' && Number.isFinite(v)) out[key] = v
    else if (kind === 'boolean' && typeof v === 'boolean') out[key] = v
    else if (kind === 'amount' && (typeof v === 'string' || typeof v === 'number') && String(v).length <= 40) out[key] = String(v)
    else throw Object.assign(new Error(`Ungültiger Parameter: ${key}`), { code: 'BAD_PARAMS' })
  }
  return out
}
