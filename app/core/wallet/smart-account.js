/**
 * ERC-4337 smart account (Safe) via Tether's WDK. The user only ever holds
 * USDT: the token paymaster fronts the gas and takes its fee in USDT.
 * Several calls (e.g. approve + bid) go into one user operation.
 * @module core/wallet/smart-account
 */
import WDK from '@tetherto/wdk'
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'
import { explain } from '../chain/reverts.js'
import { PomonaError } from '../errors.js'
import { t } from '../../i18n/index.js'

/** Never pay more than this per transaction (USDT base units, 6 decimals). */
export const DEFAULT_MAX_FEE = 5_000_000n

/** @implements {import('./account.js').Account} */
export class SmartAccount {
  /**
   * @param {Object} opts
   * @param {string} opts.seed
   * @param {import('../config/networks.js').Network} opts.net
   * @param {import('ethers').Provider} opts.provider
   * @param {object} opts.policy - from wallet/policy.js
   * @param {bigint} [opts.maxFee]
   */
  constructor ({ seed, net, provider, policy, maxFee = DEFAULT_MAX_FEE }) {
    this.kind = 'smart'
    this.net = net
    this.provider = provider
    this.wdk = new WDK(seed)
      .registerWallet('evm', WalletManagerEvmErc4337, {
        chainId: net.chainId,
        provider,
        bundlerUrl: net.aa.bundlerUrl,
        safeModulesVersion: net.aa.safeModulesVersion,
        paymasterUrl: net.aa.paymasterUrl,
        paymasterAddress: net.aa.paymasterAddress,
        paymasterToken: { address: net.token },
        transactionMaxFee: maxFee,
        transferMaxFee: maxFee
      })
      .registerPolicy(policy)
    this._account = null
  }

  /** @private */
  async _acc () {
    // Taken after registerPolicy, so the handle is policy-governed.
    if (!this._account) this._account = await this.wdk.getAccount('evm', 0)
    return this._account
  }

  async address () {
    return (await this._acc()).getAddress()
  }

  async usdtBalance () {
    return BigInt(await (await this._acc()).getTokenBalance(this.net.token))
  }

  async execute (calls, { onStep } = {}) {
    const acc = await this._acc()
    let hash
    onStep?.('sign')
    try {
      ;({ hash } = await acc.sendTransaction(calls.map((c) => ({ to: c.to, value: 0n, data: c.data }))))
    } catch (e) {
      throw translate(e)
    }
    onStep?.('confirm')
    const r = await acc.waitForTransaction(hash)
    if (r?.userOperationReceipt && r.userOperationReceipt.success === false) {
      throw new PomonaError('TX_FAILED', t('err.txFailed'))
    }
    return { hash }
  }

  async quoteFee (calls) {
    const acc = await this._acc()
    const { fee } = await acc.quoteSendTransaction(calls.map((c) => ({ to: c.to, value: 0n, data: c.data })))
    return BigInt(fee)
  }

  async sendUsdt (to, amount, { onStep } = {}) {
    const acc = await this._acc()
    let hash
    onStep?.('sign')
    try {
      ;({ hash } = await acc.transfer({ token: this.net.token, recipient: to, amount }))
    } catch (e) {
      throw translate(e)
    }
    onStep?.('confirm')
    await acc.waitForTransaction(hash)
    return { hash }
  }

  async signText (message) {
    return (await this._acc()).sign(message)
  }

  dispose () {
    this.wdk.dispose()
  }
}

/** Turns WDK/bundler errors into user-facing ones where we know them. */
export function translate (e) {
  if (e?.name === 'PolicyViolationError') return new PomonaError('POLICY', t('err.policy', { reason: e.reason || e.message }))
  if (e?.name === 'MaximumFeeExceededError') return new PomonaError('FEE_TOO_HIGH', t('err.feeTooHigh'))
  if (/AA50|paymaster token/i.test(e?.message || '')) return new PomonaError('NO_USDT_FOR_FEE', t('err.noUsdtForFee'))
  return explain(e)
}
