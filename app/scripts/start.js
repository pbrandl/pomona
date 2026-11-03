// npm start: the desktop app (Electron + pear-runtime) against a local dev chain.
//
// Starts the chain on 127.0.0.1:8545 and deploys the contracts if needed, then
// opens the window. A chain that already runs there (a second instance, or
// `npm run chain` in contracts/) is used as it is; contracts it already has are
// reused. The chain this script started stops when its window closes.
//
//   npm start
//   npm run start:second            a further instance with its own wallet
//   npm start -- <electron flags>   e.g. --storage <dir>
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contracts = join(root, '..', 'contracts')
const require = createRequire(import.meta.url)
const RPC = 'http://127.0.0.1:8545'
const STATE = join(root, '.instances', 'chain.json') // contracts on the running chain

const say = (...a) => console.log(...a)
const die = (msg) => { console.error('\n✗ ' + msg + '\n'); process.exit(1) }

if (!existsSync(join(root, 'node_modules', 'electron'))) die('Bitte zuerst im Ordner app/ einmal `npm install` ausführen.')
let electron
try { electron = require('electron') } catch {}
if (typeof electron !== 'string' || !existsSync(electron)) {
  die('Electron ist nicht vollständig installiert. Im Ordner app/: `node node_modules/electron/install.js` (hinter einer Firmen-Firewall mit NODE_EXTRA_CA_CERTS=…).')
}

async function rpc (method, params = []) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  return (await res.json()).result
}
const running = () => rpc('eth_chainId').then((id) => id === '0x7a69', () => false) // 31337
const hasCode = (address) => rpc('eth_getCode', [address, 'latest']).then((c) => !!c && c !== '0x', () => false)

say('\nPomona · Desktop-App gegen die lokale Chain\n')

let chain = null
if (await running()) {
  say('· Lokale Chain läuft schon auf 127.0.0.1:8545')
} else {
  if (!existsSync(join(contracts, 'node_modules'))) die('Bitte zuerst im Ordner contracts/ einmal `npm install` ausführen.')
  say('· Contracts bauen …')
  const built = spawnSync(process.execPath, [join(contracts, 'scripts', 'build.js')], { cwd: contracts, encoding: 'utf8' })
  if (built.status !== 0) die('Contracts ließen sich nicht bauen:\n' + built.stdout + built.stderr)
  say('· Lokale Chain starten (127.0.0.1:8545) …')
  const { startChain } = await import('../../contracts/scripts/devchain.js')
  chain = await startChain({ port: 8545 })
}

// Contracts: what this chain already has (from an earlier start or a manual
// deploy), otherwise deploy them now.
const genesis = (await rpc('eth_getBlockByNumber', ['0x0', false]))?.hash
const known = []
try { known.push(JSON.parse(readFileSync(STATE, 'utf8'))) } catch {}
try { known.push((await import('../core/config/deployments.js')).default.local) } catch {}
let local = null
for (const k of known) {
  if (k?.factory && (!k.genesis || k.genesis === genesis) && await hasCode(k.factory)) { local = { factory: k.factory, token: k.token }; break }
}
if (local) {
  say('· Contracts sind schon da')
} else {
  say('· Contracts deployen …')
  const { deploy } = await import('../../contracts/scripts/deploy.js')
  local = await deploy({ rpc: RPC })
  mkdirSync(dirname(STATE), { recursive: true })
  writeFileSync(STATE, JSON.stringify({ genesis, ...local }, null, 2))
}

say('· Fenster öffnen …' + (chain ? ' (die Chain läuft, bis dieses Fenster geschlossen wird; Ctrl+C beendet alles)' : '') + '\n')
const app = spawn(electron, ['.', '--dev', '--local', JSON.stringify({ rpc: RPC, ...local }), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })

async function stop (code) {
  if (chain) await chain.stop().catch(() => {})
  process.exit(code ?? 0)
}
app.on('exit', stop)
process.on('SIGINT', () => app.kill('SIGTERM'))
process.on('SIGTERM', () => app.kill('SIGTERM'))
