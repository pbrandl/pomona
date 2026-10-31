import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import createTestnet from 'hyperdht/testnet.js'
import DHT from 'hyperdht'
import { startChain } from '../../contracts/scripts/devchain.js'
import { deploy } from '../../contracts/scripts/deploy.js'
import { Pomona } from '../core/pomona.js'

export async function setup () {
  const chain = await startChain()
  const addresses = await deploy({ rpc: chain.url })
  const testnet = await createTestnet(3)
  const dirs = []
  const apps = []
  const make = async () => {
    const storage = mkdtempSync(join(tmpdir(), 'pomona-'))
    dirs.push(storage)
    const app = new Pomona({
      storage,
      // Loopback-only DHT: the CI sandbox blocks UDP on other interfaces.
      dht: new DHT({ bootstrap: testnet.bootstrap, host: '127.0.0.1' }),
      defaultNetwork: 'local',
      networkOverrides: { local: { rpc: chain.url, ...addresses } },
      pollMs: 60000
    })
    apps.push(app)
    return app.ready()
  }
  const warp = async (seconds) => {
    const call = (method, params) => fetch(chain.url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    })
    await call('evm_increaseTime', [seconds])
    await call('evm_mine', [])
  }
  const teardown = async () => {
    for (const a of apps) await a.close().catch(() => {})
    await testnet.destroy()
    await chain.stop()
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  }
  return { make, warp, teardown, addresses }
}
