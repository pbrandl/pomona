// Deploys PomonaFactory (and MockUSDT on test chains) and records the
// addresses in app/core/deployments.js.
//
//   node scripts/deploy.js local                                 # dev chain on :8545
//   RPC=… PRIVATE_KEY=… node scripts/deploy.js sepolia           # testnet, deploys MockUSDT
//   RPC=… PRIVATE_KEY=… TOKEN=0x… node scripts/deploy.js arbitrum   # existing USDT
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HARDHAT_DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const artifact = (n) => JSON.parse(readFileSync(join(root, 'artifacts', n + '.json')))

export async function deploy ({ rpc, privateKey = HARDHAT_DEV_KEY, token = null }) {
  const provider = new JsonRpcProvider(rpc, undefined, { pollingInterval: 50 })
  const signer = new Wallet(privateKey, provider)
  const make = async (name) => {
    const a = artifact(name)
    const c = await new ContractFactory(a.abi, a.bytecode, signer).deploy()
    await c.waitForDeployment()
    return c.getAddress()
  }
  if (!token) token = await make('MockUSDT')
  const factory = await make('PomonaFactory')
  provider.destroy()
  return { factory, token }
}

export function record (networkId, addresses) {
  const file = join(root, '..', 'app', 'core', 'deployments.js')
  const current = readFileSync(file, 'utf8').match(/export default (\{[\s\S]*\})/)
  const all = current ? JSON.parse(current[1]) : {}
  all[networkId] = addresses
  writeFileSync(file, '// Written by contracts/scripts/deploy.js. Do not edit by hand.\nexport default ' + JSON.stringify(all, null, 2) + '\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2] || 'local'
  const rpc = process.env.RPC || (id === 'local' ? 'http://127.0.0.1:8545' : null)
  if (!rpc) throw new Error('RPC fehlt')
  const addresses = await deploy({ rpc, privateKey: process.env.PRIVATE_KEY || HARDHAT_DEV_KEY, token: process.env.TOKEN || null })
  record(id, addresses)
  console.log(id, addresses)
}
