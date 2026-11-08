/**
 * JSON-RPC access for reads. Signing never happens here: every write goes
 * through the WDK account (see wallet/).
 * @module core/chain/provider
 */
import { JsonRpcProvider } from 'ethers'

/** Socket errors after which a read is simply sent again (the server closed a kept-alive connection). */
const TRANSIENT = new Set(['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_SOCKET'])
/** Methods that change chain state are never repeated automatically. */
const NO_RETRY = new Set(['eth_sendRawTransaction', 'eth_sendTransaction'])

/** @param {any} e */
export function isTransient (e) {
  const code = e?.code ?? e?.cause?.code
  return TRANSIENT.has(code) || /ECONNRESET|socket hang up|other side closed/i.test(String(e?.message ?? ''))
}

/**
 * A JsonRpcProvider that retries reads after a dropped connection. ethers'
 * log polling (provider.on(filter)) has no error handling of its own: one
 * reset socket during eth_getLogs would otherwise end as an unhandled
 * rejection in the worker.
 */
export class RetryingProvider extends JsonRpcProvider {
  /** @param {any} payload */
  async _send (payload) {
    const methods = (Array.isArray(payload) ? payload : [payload]).map((p) => p?.method)
    const retries = methods.some((m) => NO_RETRY.has(m)) ? 0 : 2
    for (let attempt = 0; ; attempt++) {
      try {
        return await super._send(payload)
      } catch (e) {
        if (attempt >= retries || !isTransient(e)) throw e
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
      }
    }
  }
}

/**
 * @param {import('../config/networks.js').Network} net
 * @returns {JsonRpcProvider}
 */
export function providerFor (net) {
  return new RetryingProvider(net.rpc, net.chainId, {
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
