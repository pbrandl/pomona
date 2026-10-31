/**
 * Picks the right account implementation for a network.
 * @module core/wallet
 */
import { SmartAccount } from './smart-account.js'
import { DevAccount } from './dev-account.js'
import { pomonaPolicy } from './policy.js'

export { seal, open, checkPassword } from './vault.js'
export { isAllowedCall, pomonaPolicy } from './policy.js'

/**
 * @param {Object} opts
 * @param {string} opts.seed
 * @param {import('../config/networks.js').Network} opts.net
 * @param {import('ethers').Provider} opts.provider
 * @param {import('./policy.js').PolicyTargets} opts.targets - what the wallet may talk to
 * @returns {import('./account.js').Account}
 */
export function openAccount ({ seed, net, provider, targets }) {
  const policy = pomonaPolicy(targets)
  return net.dev
    ? new DevAccount({ seed, net, provider, policy })
    : new SmartAccount({ seed, net, provider, policy })
}
