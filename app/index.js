// Pear desktop entry (runs in Bare). Opens the Electron UI; the UI itself
// starts the worker (worker/index.js) that holds wallet, P2P and chain access.
import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'

const bridge = new Bridge()
await bridge.ready()

const runtime = new Runtime()
const pipe = runtime.start({ bridge })
Pear.teardown(() => pipe.end())
