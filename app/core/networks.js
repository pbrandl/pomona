// Chains Pomona can run a round on. `factory` and `token` are filled in by
// contracts/scripts/deploy.js (see deployments.js). The organizer picks the
// network when creating the round; the invite link carries it to bidders.
import deployments from './deployments.js'

export const NETWORKS = {
  local: {
    name: 'Lokal (Hardhat)',
    chainId: 31337,
    rpc: 'http://127.0.0.1:8545',
    explorer: null,
    native: 'ETH',
    dev: true
  },
  sepolia: {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    native: 'ETH'
  },
  'arbitrum-sepolia': {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
    native: 'ETH'
  }
}

export function network (id, overrides = {}) {
  const base = NETWORKS[id]
  if (!base) throw new Error('Unbekanntes Netzwerk: ' + id)
  return { id, ...base, ...(deployments[id] || {}), ...overrides }
}
