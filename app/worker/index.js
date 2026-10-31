/**
 * Background worker (Bare). Owns the encrypted seed, the Hyperswarm and the
 * chain connection. The UI reaches it only through the whitelisted RPC methods
 * in core/rpc/methods.js.
 */
import pearPipe from 'pear-pipe'
import { Pomona, serve, METHODS } from '../core/bare.js'

const pipe = pearPipe()
const app = Pear.app ?? Pear.config
const dev = !!app.dev

const pomona = new Pomona({
  storage: app.storage,
  // The local Hardhat chain (with its public dev key) exists only in `pear run --dev`.
  allowDev: dev,
  defaultNetwork: dev ? 'local' : 'sepolia'
})

await pomona.ready()
const rpc = serve(pipe, pomona, METHODS)

let pending = null
pomona.on('change', () => {
  if (pending) return
  pending = setTimeout(() => { pending = null; rpc.emit('change') }, 100)
})
pomona.on('error', (e) => rpc.emit('error', e?.message || String(e)))
rpc.emit('ready')

Pear.teardown(() => pomona.close())
