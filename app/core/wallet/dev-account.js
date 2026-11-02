/**
 * Account for the local development chain only. There is no bundler or
 * paymaster on Hardhat, so this is a plain WDK EVM account whose gas (ETH) is
 * topped up invisibly from Hardhat's public dev key. The UI still only shows
 * USDT. Never enabled outside `pear run --dev` (see Pomona `allowDev`).
 * @module core/wallet/dev-account
 */
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { Wallet, Contract, parseEther } from 'ethers'
import { translate } from './smart-account.js'
import { PomonaError } from '../errors.js'

/** Hardhat's first default account. Public knowledge; worthless outside a dev chain. */
export const HARDHAT_DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const MINT_ABI = ['function mint(address to, uint256 amount)']

/** @implements {import('./account.js').Account} */
export class DevAccount {
  /**
   * @param {Object} opts
   * @param {string} opts.seed
   * @param {import('../config/networks.js').Network} opts.net
   * @param {import('ethers').Provider} opts.provider
   * @param {object} opts.policy
   */
  constructor ({ seed, net, provider, policy }) {
    if (!net.dev) throw new Error('DevAccount only runs on a dev network')
    this.kind = 'dev'
    this.net = net
    this.provider = provider
    this.wdk = new WDK(seed)
      .registerWallet('evm', WalletManagerEvm, { provider, chainId: net.chainId })
      .registerPolicy(policy)
    this._account = null
    this._funder = new Wallet(HARDHAT_DEV_KEY, provider)
  }

  /** @private */
  async _acc () {
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
    await this._ensureGas()
    let last = null
    onStep?.('sign')
    for (const c of calls) {
      let hash
      try {
        ;({ hash } = await acc.sendTransaction({ to: c.to, value: 0n, data: c.data }))
      } catch (e) {
        throw translate(e)
      }
      onStep?.('confirm')
      const r = await this.provider.waitForTransaction(hash)
      if (!r || r.status !== 1) throw new PomonaError('TX_FAILED', 'Die Transaktion ist fehlgeschlagen.')
      last = hash
    }
    return { hash: last }
  }

  async quoteFee () {
    return null // gas is invisible on the dev chain
  }

  async sendUsdt (to, amount, { onStep } = {}) {
    const acc = await this._acc()
    await this._ensureGas()
    let hash
    onStep?.('sign')
    try {
      ;({ hash } = await acc.transfer({ token: this.net.token, recipient: to, amount }))
    } catch (e) {
      throw translate(e)
    }
    onStep?.('confirm')
    await this.provider.waitForTransaction(hash)
    return { hash }
  }

  /** Dev faucet: mints test USDT to this account. */
  async faucet (amount) {
    const usdt = new Contract(this.net.token, MINT_ABI, this._funder)
    await (await usdt.mint(await this.address(), amount)).wait()
  }

  /** @private */
  async _ensureGas () {
    const me = await this.address()
    if (await this.provider.getBalance(me) >= parseEther('0.05')) return
    await (await this._funder.sendTransaction({ to: me, value: parseEther('1') })).wait()
  }

  async signText (message) {
    return (await this._acc()).sign(message)
  }

  dispose () {
    this.wdk.dispose()
  }
}
