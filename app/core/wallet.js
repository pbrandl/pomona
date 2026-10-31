// Self-custodial wallet on top of Tether's WDK. The seed never leaves this
// device; it is kept in a local, never-replicated Hyperbee (see store.js).
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

export class Wallet {
  // `provider` is an ethers provider shared with the rest of the app, so nonces
  // and balances are never served from a stale cache between two transactions.
  constructor (seed, net, provider = net.rpc) {
    this.seed = seed
    this.net = net
    this.wdk = new WDK(seed).registerWallet('evm', WalletManagerEvm, { provider, chainId: net.chainId })
    this.account = null
  }

  static createSeed () {
    return WDK.getRandomSeedPhrase(12)
  }

  static isValidSeed (seed) {
    return WDK.isValidSeed(seed)
  }

  async ready () {
    if (!this.account) this.account = await this.wdk.getAccount('evm', 0)
    return this
  }

  async address () {
    await this.ready()
    return this.account.getAddress()
  }

  async nativeBalance () {
    await this.ready()
    return BigInt(await this.account.getBalance())
  }

  async tokenBalance (token) {
    await this.ready()
    return BigInt(await this.account.getTokenBalance(token))
  }

  async approve (token, spender, amount) {
    await this.ready()
    return this.account.approve({ token, spender, amount })
  }

  async send (to, data, value = 0n) {
    await this.ready()
    return this.account.sendTransaction({ to, data, value })
  }

  async transfer (token, recipient, amount) {
    await this.ready()
    return this.account.transfer({ token, recipient, amount })
  }

  dispose () {
    this.wdk.dispose()
  }
}
