/**
 * Worker for the developer mode without Pear (`npm run dev`, scripts/dev.js).
 * Same Bare runtime and same core as worker/index.js; only the transport
 * differs: JSON-RPC lines over stdin/stdout instead of pear-pipe.
 *
 * Started with one JSON argument:
 *   { storage, local, bootstrap, modelsDir, modelsLocalOnly }
 *
 * stdout carries the RPC protocol only. Everything that logs goes to stderr.
 */
import { Pomona, serve, METHODS } from '../core/bare.js'
import DHT from 'hyperdht'

console.log = console.info = console.debug = console.error

const env = JSON.parse(Bare.argv[Bare.argv.length - 1])

const pomona = new Pomona({
  storage: env.storage,
  // Local P2P network of scripts/dev.js on loopback: no traffic leaves the machine.
  dht: new DHT({ bootstrap: env.bootstrap, host: '127.0.0.1' }),
  allowDev: true,
  defaultNetwork: 'local',
  networkOverrides: { local: env.local },
  modelsDir: env.modelsDir,
  modelsLocalOnly: env.modelsLocalOnly
})

await pomona.ready()

const pipe = {
  write: (line) => process.stdout.write(line),
  on: (event, fn) => process.stdin.on(event, fn)
}
const rpc = serve(pipe, pomona, METHODS)

let pending = null
pomona.on('change', () => {
  if (pending) return
  pending = setTimeout(() => { pending = null; rpc.emit('change') }, 100)
})
pomona.on('error', (e) => rpc.emit('error', e?.message || String(e)))
rpc.emit('ready')

let closing = false
const shutdown = async () => {
  if (closing) return
  closing = true
  await pomona.close().catch(() => {})
  Bare.exit(0)
}
process.stdin.on('end', shutdown) // the dev server went away
Bare.on('beforeExit', shutdown)
