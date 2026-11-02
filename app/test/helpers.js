// Test harness: a real local EVM (Hardhat node), the real contracts, a local
// HyperDHT testnet and as many Pomona instances as a test needs.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import createTestnet from 'hyperdht/testnet.js'
import DHT from 'hyperdht'
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers'
import { startChain } from '../../contracts/scripts/devchain.js'
import { deploy, HARDHAT_DEV_KEY } from '../../contracts/scripts/deploy.js'
import { Pomona } from '../core/index.js'

export const PASSWORD = 'birnenbaum-2027'

export async function setup () {
  const chain = await startChain()
  const addresses = await deploy({ rpc: chain.url })
  const testnet = await createTestnet(3)
  const dirs = []
  const apps = []
  // Many app instances share one Hardhat node in tests: poll for events less eagerly.
  const local = { rpc: chain.url, pollMs: 400, ...addresses }

  /** @returns {Promise<Pomona>} */
  const make = async (opts = {}) => {
    const storage = opts.storage ?? mkdtempSync(join(tmpdir(), 'pomona-'))
    if (!opts.storage) dirs.push(storage)
    const app = new Pomona({
      storage,
      // Loopback-only DHT: sandboxes often block UDP on other interfaces.
      dht: new DHT({ bootstrap: testnet.bootstrap, host: '127.0.0.1' }),
      defaultNetwork: 'local',
      allowDev: opts.allowDev ?? true,
      networkOverrides: { local },
      pollMs: 60000,
      assistantEngine: opts.assistantEngine
    })
    apps.push(app)
    return app.ready()
  }

  /** A wallet with 5,000 test USDT. */
  const funded = async (opts = {}) => {
    const app = await make(opts)
    await app.createWallet({ password: PASSWORD })
    await app.faucet()
    return app
  }

  const rpc = (method, params) => fetch(chain.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }).then((r) => r.json())

  const warp = async (seconds) => {
    await rpc('evm_increaseTime', [seconds])
    await rpc('evm_mine', [])
  }

  /** Deploys a PomonaRound directly, bypassing the factory (an attacker's look-alike). */
  const deployForgedRound = async (organizer) => {
    const a = JSON.parse(readFileSync(new URL('../../contracts/artifacts/PomonaRound.json', import.meta.url)))
    const provider = new JsonRpcProvider(chain.url, undefined, { cacheTimeout: -1, pollingInterval: 50 })
    const signer = new Wallet(HARDHAT_DEV_KEY, provider)
    const now = (await provider.getBlock('latest')).timestamp
    const c = await new ContractFactory(a.abi, a.bytecode, signer).deploy(0, addresses.token, organizer, 1_000_000n, 0n, now + 86400, 7 * 86400, 4, '0x0000000000000000000000000000000000000000')
    await c.waitForDeployment()
    const address = await c.getAddress()
    await provider.removeAllListeners() // no log polling may outlive the provider
    provider.destroy()
    return address
  }

  const teardown = async () => {
    for (const a of apps) await a.close().catch(() => {})
    await testnet.destroy()
    await chain.stop()
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  }

  return { make, funded, warp, teardown, deployForgedRound, addresses, local }
}
