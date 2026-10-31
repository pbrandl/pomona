import { JsonRpcProvider, ContractFactory, Contract, Wallet, getBytes } from 'ethers'
import { readFileSync } from 'node:fs'
import { startChain } from '../scripts/devchain.js'

export const artifact = (name) =>
  JSON.parse(readFileSync(new URL(`../artifacts/${name}.json`, import.meta.url)))

export async function chain () {
  const node = await startChain()
  const provider = new JsonRpcProvider(node.url, undefined, { cacheTimeout: -1, pollingInterval: 20 })
  const signers = await Promise.all([0, 1, 2, 3, 4, 5].map(i => provider.getSigner(i)))
  const now = async () => (await provider.getBlock('latest')).timestamp
  const warp = async (seconds) => {
    await provider.send('evm_increaseTime', [seconds])
    await provider.send('evm_mine', [])
  }
  const close = async () => { provider.destroy(); await node.stop() }
  return { url: node.url, provider, signers, now, warp, close }
}

export async function deploy (name, signer, ...args) {
  const a = artifact(name)
  const c = await new ContractFactory(a.abi, a.bytecode, signer).deploy(...args)
  await c.waitForDeployment()
  return c
}

export function at (name, address, runner) {
  return new Contract(address, artifact(name).abi, runner)
}

export async function signInvite (round, inviteKey, bidder) {
  const digest = await round.inviteDigest(bidder)
  return new Wallet(inviteKey).signMessage(getBytes(digest))
}
