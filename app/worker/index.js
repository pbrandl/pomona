// Background worker (Bare). Owns the seed, the Hyperswarm and the chain
// connection. The UI reaches it only through the explicit RPC methods.
import pearPipe from 'pear-pipe'
import { Pomona, serve, METHODS } from '../core/bare.js'

const pipe = pearPipe()
const app = Pear.app ?? Pear.config
const args = app.args || []
const flag = args.indexOf('--network')

const pomona = new Pomona({
  storage: app.storage,
  defaultNetwork: flag !== -1 ? args[flag + 1] : 'local'
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
