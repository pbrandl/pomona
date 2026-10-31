/**
 * Chains Pomona can run a round on.
 *
 * Every round is settled in USDT. Users never need ETH: on real networks the
 * wallet is an ERC-4337 smart account (Safe) whose fees are paid in USDT through
 * a token paymaster (`aa`). Only the local development chain uses a plain
 * account whose gas is topped up invisibly by the dev faucet.
 *
 * To enable a network:
 *  1. Deploy the factory:   cd contracts && RPC=… PRIVATE_KEY=… node scripts/deploy.js <id>
 *     (writes `factory`/`token` to deployments.js)
 *  2. Fill in `aa` with a bundler and a USDT token paymaster (e.g. Candide or
 *     Pimlico; see https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration).
 *     The app refuses to start a round on a network that is not complete.
 *
 * @module core/config/networks
 */
import deployments from './deployments.js'

/**
 * @typedef {Object} AccountAbstraction
 * @property {string|null} bundlerUrl
 * @property {string|null} paymasterUrl
 * @property {string|null} paymasterAddress - checked by WDK against the paymaster RPC
 * @property {string} safeModulesVersion
 */

/**
 * @typedef {Object} Network
 * @property {string} id
 * @property {string} name
 * @property {number} chainId
 * @property {string} rpc
 * @property {string|null} explorer
 * @property {boolean} dev - local chain: dev account + faucet, only in `pear run --dev`
 * @property {AccountAbstraction|null} aa
 * @property {string|null} factory - PomonaFactory address
 * @property {string|null} token   - USDT address
 */

const NETWORKS = {
  local: {
    name: 'Lokal (Entwicklung)',
    chainId: 31337,
    rpc: 'http://127.0.0.1:8545',
    explorer: null,
    dev: true,
    aa: null
  },
  sepolia: {
    name: 'Ethereum Sepolia (Test)',
    chainId: 11155111,
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    dev: false,
    aa: { bundlerUrl: null, paymasterUrl: null, paymasterAddress: null, safeModulesVersion: '0.3.0' }
  },
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpc: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    dev: false,
    token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    aa: { bundlerUrl: null, paymasterUrl: null, paymasterAddress: null, safeModulesVersion: '0.3.0' }
  }
}

/** @returns {string[]} */
export function networkIds () {
  return Object.keys(NETWORKS)
}

/**
 * @param {string} id
 * @param {Partial<Network>} [overrides] - used by tests and local setups
 * @returns {Network}
 */
export function getNetwork (id, overrides = {}) {
  const base = NETWORKS[id]
  if (!base) throw new Error('Unbekanntes Netzwerk: ' + id)
  return { id, factory: null, token: null, ...base, ...(deployments[id] || {}), ...overrides }
}

/**
 * Whether a round can be created and joined on this network.
 * @param {Network} net
 * @returns {boolean}
 */
export function isReady (net) {
  if (!net.factory || !net.token) return false
  if (net.dev) return true
  const aa = net.aa
  return !!(aa && aa.bundlerUrl && aa.paymasterUrl && aa.paymasterAddress)
}
