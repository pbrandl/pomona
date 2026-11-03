/**
 * Background worker (Bare). The Electron main process starts it through
 * pear-runtime (electron/main.cjs). It owns the encrypted seed, the Hyperswarm
 * and the chain connection. The UI reaches it only through the whitelisted RPC
 * methods in core/rpc/methods.js: newline-delimited JSON over `Bare.IPC`.
 *
 * Started with one JSON argument: { storage, dev, local }
 *   storage  directory for wallet vault and Corestore
 *   dev      local Hardhat chain with its public dev key (npm start)
 *   local    its rpc and contract addresses (scripts/start.js), or null
 */
import goodbye from 'graceful-goodbye'
import { Pomona, serve, METHODS } from '../core/bare.js'

const env = JSON.parse(Bare.argv[Bare.argv.length - 1])
const pipe = Bare.IPC

const pomona = new Pomona({
  storage: env.storage,
  allowDev: !!env.dev,
  defaultNetwork: env.dev ? 'local' : 'arbitrum-sepolia',
  networkOverrides: env.dev && env.local ? { local: env.local } : {}
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

// The main process stops the worker with SIGTERM when the app quits (and the
// worker ends when the pipe does): close swarm and storage cleanly first.
goodbye(() => pomona.close())
pipe.on('end', () => goodbye.exit())
