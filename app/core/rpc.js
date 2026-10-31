// Minimal newline-delimited JSON-RPC over any duplex stream (the pear-pipe
// between UI and worker). Requests: {id, method, params}. Replies: {id, result}
// or {id, error}. Push events: {event, data}.

export function serve (stream, app, methods) {
  let buf = ''
  const send = (msg) => stream.write(JSON.stringify(msg) + '\n')
  stream.on('data', async (chunk) => {
    buf += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      if (!line.trim()) continue
      let req
      try { req = JSON.parse(line) } catch { continue }
      const fn = methods[req.method]
      if (!fn) {
        send({ id: req.id, error: 'Unbekannte Methode: ' + req.method })
        continue
      }
      try {
        send({ id: req.id, result: (await fn.call(app, req.params || {})) ?? null })
      } catch (e) {
        send({ id: req.id, error: e?.message || String(e) })
      }
    }
  })
  return { emit: (event, data) => send({ event, data }) }
}

// The methods the UI may call. Keep this list explicit: nothing else of the
// Pomona object is reachable from the renderer.
export const METHODS = {
  status () { return this.status() },
  createWallet () { return this.createWallet() },
  restoreWallet ({ seed }) { return this.restoreWallet(seed) },
  revealSeed () { return this.revealSeed() },
  faucet () { return this.faucet() },
  createRound (p) { return this.createRound(p) },
  join ({ link }) { return this.join(link) },
  bid ({ amount }) { return this.bid(amount) },
  withdraw ({ amount }) { return this.withdraw(amount) },
  claim () { return this.claim() },
  refund () { return this.refund() },
  cancel () { return this.cancel() },
  postNews ({ text }) { return this.postNews(text) },
  invite () { return this.invite() },
  qr ({ text }) { return this.qr(text) }
}
