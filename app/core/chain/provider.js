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
    // Live updates poll eth_getLogs per new block instead of server-side
    // filters, which load-balanced public RPC endpoints often drop.
    polling: true,
    // Drives how quickly contract events (new bids, invoices) are noticed.
    pollingInterval: net.pollMs ?? 2000
  })
}
