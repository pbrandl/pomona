/**
 * JSON-RPC access for reads. Signing never happens here: every write goes
 * through the WDK account (see wallet/).
 * @module core/chain/provider
 */
import { JsonRpcProvider } from 'ethers'

/**
 * @param {import('../config/networks.js').Network} net
 * @returns {JsonRpcProvider}
 */
export function providerFor (net) {
  return new JsonRpcProvider(net.rpc, net.chainId, {
    staticNetwork: true,
    // Never answer from cache: nonces, allowances and balances must be fresh
    // between two transactions.
    cacheTimeout: -1,
    pollingInterval: net.dev ? 50 : 2000
  })
}
