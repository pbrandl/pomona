// The whole app behind one object. The UI talks to it over RPC (see rpc.js);
// tests drive it directly. Exactly one round per app instance.
import { EventEmitter } from 'events'
import { Wallet as KeyWallet, JsonRpcProvider, Contract, parseUnits, formatUnits, parseEther, ZeroAddress } from 'ethers'
import qrcode from 'qrcode-generator'
import { P2P } from './p2p.js'
import { Wallet } from './wallet.js'
import { RoundClient, providerFor, sendAndWait } from './round.js'
import { network, NETWORKS } from './networks.js'
import { encodeInvite, decodeInvite } from './invite.js'
import abi from './abi.js'

// Hardhat's first default account. Public, test-only: used by the local faucet.
const HARDHAT_DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

export class Pomona extends EventEmitter {
  constructor ({ storage, bootstrap, dht, defaultNetwork = 'local', networkOverrides = {}, pollMs } = {}) {
    super()
    this.p2p = new P2P(storage, { bootstrap, dht })
    this.defaultNetwork = defaultNetwork
    this.overrides = networkOverrides
    this.pollMs = pollMs
    this.net = null
    this.wallet = null
    this.provider = null
    this.round = null
    this.token = null
    this.manifest = null
    this.role = null // 'organizer' | 'bidder' | null
    this.inviteKey = null
    this.link = null
    this._timer = null
    this._unwatch = null
    this._busy = null
  }

  #net (id) {
    return network(id, this.overrides[id])
  }

  async ready () {
    await this.p2p.ready()
    const seed = await this.p2p.getSetting('seed')
    const saved = await this.p2p.getSetting('round')
    this.#useNetwork(saved?.network ?? this.defaultNetwork)
    if (seed) this.#useWallet(seed)
    if (saved) await this.#restore(saved).catch((e) => this.emit('error', e))
    return this
  }

  #useNetwork (id) {
    this.net = this.#net(id)
    this.provider?.destroy()
    this.provider = providerFor(this.net)
    if (this.wallet) this.#useWallet(this.wallet.seed)
  }

  #useWallet (seed) {
    this.wallet?.dispose()
    this.wallet = new Wallet(seed, this.net, this.provider)
  }

  // ----------------------------------------------------------------- wallet

  async createWallet () {
    if (this.wallet) throw new Error('Es gibt bereits eine Wallet.')
    const seed = Wallet.createSeed()
    await this.p2p.setSetting('seed', seed)
    this.#useWallet(seed)
    this.#changed()
    return { address: await this.wallet.address() }
  }

  async restoreWallet (seed) {
    seed = String(seed).trim().toLowerCase().split(/\s+/).join(' ')
    if (!Wallet.isValidSeed(seed)) throw new Error('Diese Wiederherstellungsphrase ist ungültig.')
    await this.p2p.setSetting('seed', seed)
    this.#useWallet(seed)
    this.#changed()
    return { address: await this.wallet.address() }
  }

  revealSeed () {
    if (!this.wallet) throw new Error('Keine Wallet vorhanden.')
    return this.wallet.seed
  }

  // Local dev chain only: 1 ETH for gas and 5,000 test USDT.
  async faucet () {
    if (!this.net.dev) throw new Error('Den Faucet gibt es nur auf der lokalen Test-Chain.')
    this.#needWallet()
    const me = await this.wallet.address()
    const dev = new KeyWallet(HARDHAT_DEV_KEY, this.provider)
    await (await dev.sendTransaction({ to: me, value: parseEther('1') })).wait()
    if (this.net.token) {
      const token = new Contract(this.net.token, abi.MockUSDT, dev)
      await (await token.mint(me, parseUnits('5000', 6))).wait()
    }
    this.#changed()
  }

  // ------------------------------------------------------------------ round

  async createRound ({ title, description = '', network: netId = this.net.id, target, days, minBid = '0', inviteOnly = true }) {
    this.#needWallet()
    if (this.round) throw new Error('Diese App hat bereits eine Runde.')
    title = String(title || '').trim()
    if (!title) throw new Error('Bitte gib der Runde einen Namen.')
    if (!(Number(days) > 0)) throw new Error('Bitte eine Laufzeit angeben.')
    this.#useNetwork(netId)
    if (!this.net.token) throw new Error('Auf diesem Netzwerk ist kein Token konfiguriert.')

    const token = await this.#tokenMeta(this.net.token)
    const targetUnits = this.#parse(target, token.decimals, 'Zielbetrag')
    if (targetUnits === 0n) throw new Error('Der Zielbetrag muss größer als 0 sein.')
    const minUnits = this.#parse(minBid || '0', token.decimals, 'Mindestgebot')
    const now = (await this.provider.getBlock('latest')).timestamp
    const deadline = now + Math.round(Number(days) * 86400)
    const invite = inviteOnly ? KeyWallet.createRandom() : null

    const round = await this.#busy('create', () => RoundClient.create({
      net: this.net,
      wallet: this.wallet,
      provider: this.provider,
      token: token.address,
      target: targetUnits,
      deadline,
      minBid: minUnits,
      inviteSigner: invite ? invite.address : ZeroAddress
    }))

    const manifestKey = await this.p2p.openOwnManifest()
    const organizer = await this.wallet.address()
    await this.p2p.putRound({
      v: 1, title, description: String(description).trim(), network: this.net.id, chainId: this.net.chainId,
      round: round.address, organizer, createdAt: Date.now()
    })
    const saved = { role: 'organizer', network: this.net.id, manifest: manifestKey, round: round.address, inviteKey: invite?.privateKey ?? null }
    await this.p2p.setSetting('round', saved)
    await this.#restore(saved)
    return { link: this.link }
  }

  async join (link) {
    this.#needWallet()
    if (this.round) throw new Error('Diese App hat bereits eine Runde.')
    const inv = decodeInvite(link)
    if (!NETWORKS[inv.network]) throw new Error('Unbekanntes Netzwerk im Link: ' + inv.network)
    this.#useNetwork(inv.network)
    const manifest = await this.p2p.openRemoteManifest(inv.manifest)
    if (manifest.round.toLowerCase() !== inv.round.toLowerCase()) throw new Error('Link und Runde passen nicht zusammen.')
    const saved = { role: 'bidder', network: inv.network, manifest: inv.manifest, round: inv.round, inviteKey: inv.inviteKey }
    await this.p2p.setSetting('round', saved)
    await this.#restore(saved)
    return this.status()
  }

  async #restore (saved) {
    this.#useNetwork(saved.network)
    this.role = saved.role
    this.inviteKey = saved.inviteKey
    this.link = encodeInvite({ manifest: saved.manifest, network: saved.network, round: saved.round, inviteKey: saved.inviteKey })
    if (!this.p2p.manifest) {
      if (saved.role === 'organizer') await this.p2p.openOwnManifest()
      else this.manifest = await this.p2p.openRemoteManifest(saved.manifest)
    }
    this.manifest = await this.p2p.getRound()
    this.round = new RoundClient({ net: this.net, address: saved.round, wallet: this.wallet, provider: this.provider })
    this.token = await this.round.token()
    this._unwatch = this.p2p.onChange(async () => {
      this.manifest = await this.p2p.getRound()
      this.#changed()
    })
    this.#poll()
    this.#changed()
  }

  async bid (amount) {
    const units = this.#parse(amount, this.token.decimals, 'Betrag')
    await this.#busy('bid', () => this.round.bid(units, this.inviteKey))
  }

  async withdraw (amount = 'all') {
    const me = await this.wallet.address()
    const units = amount === 'all' ? await this.round.pledgeOf(me) : this.#parse(amount, this.token.decimals, 'Betrag')
    await this.#busy('withdraw', () => this.round.withdraw(units))
  }

  async claim () { await this.#busy('claim', () => this.round.claim()) }
  async refund () { await this.#busy('refund', () => this.round.refund()) }
  async cancel () { await this.#busy('cancel', () => this.round.cancel()) }

  async postNews (text) {
    if (this.role !== 'organizer') throw new Error('Nur der Organisator kann Neuigkeiten posten.')
    text = String(text || '').trim()
    if (!text) return
    await this.p2p.postNews(text)
  }

  invite () {
    if (!this.link) throw new Error('Noch keine Runde.')
    return { link: this.link, qr: qrSvg(this.link) }
  }

  qr (text) {
    return qrSvg(String(text))
  }

  // ----------------------------------------------------------------- status

  async status () {
    const s = {
      network: { id: this.net.id, name: this.net.name, dev: !!this.net.dev, explorer: this.net.explorer, native: this.net.native },
      networks: Object.entries(NETWORKS).map(([id, n]) => ({ id, name: n.name, ready: !!this.#net(id).factory })),
      peers: this.p2p.peers,
      busy: this._busy,
      wallet: null,
      round: null
    }
    if (this.wallet) {
      const address = await this.wallet.address()
      const tokenAddr = this.token?.address ?? this.net.token
      const [native, tokenBal] = await Promise.all([
        this.wallet.nativeBalance().catch(() => null),
        tokenAddr ? this.wallet.tokenBalance(tokenAddr).catch(() => null) : null
      ])
      const decimals = this.token?.decimals ?? 6
      s.wallet = {
        address,
        native: native === null ? null : formatUnits(native, 18),
        token: tokenBal === null ? null : formatUnits(tokenBal, decimals),
        symbol: this.token?.symbol ?? 'USDT'
      }
    }
    if (this.round) {
      const [info, mine, news] = await Promise.all([
        this.round.info(),
        this.wallet ? this.round.pledgeOf(await this.wallet.address()) : 0n,
        this.p2p.news()
      ])
      const d = this.token.decimals
      s.round = {
        role: this.role,
        title: this.manifest?.title ?? '',
        description: this.manifest?.description ?? '',
        // The manifest is only trusted if it names the same organizer as the contract.
        verified: !!this.manifest && this.manifest.organizer.toLowerCase() === info.organizer.toLowerCase(),
        address: info.address,
        organizer: info.organizer,
        symbol: this.token.symbol,
        target: formatUnits(info.target, d),
        total: formatUnits(info.total, d),
        minBid: formatUnits(info.minBid, d),
        progress: info.target === 0n ? 0 : Number((info.total * 10000n) / info.target) / 10000,
        deadline: info.deadline,
        now: (await this.provider.getBlock('latest')).timestamp,
        state: info.state,
        claimed: info.claimed,
        inviteOnly: info.inviteSigner !== ZeroAddress,
        bidders: info.bidderCount,
        myPledge: formatUnits(mine, d),
        news
      }
    }
    return s
  }

  // ---------------------------------------------------------------- helpers

  #needWallet () {
    if (!this.wallet) throw new Error('Bitte zuerst eine Wallet anlegen.')
  }

  #parse (value, decimals, label) {
    const v = String(value ?? '').trim().replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(label + ': bitte eine Zahl eingeben.')
    try {
      return parseUnits(v, decimals)
    } catch {
      throw new Error(label + ': zu viele Nachkommastellen.')
    }
  }

  async #tokenMeta (address) {
    const t = new Contract(address, abi.MockUSDT, this.provider)
    const [symbol, decimals] = await Promise.all([t.symbol(), t.decimals()])
    return { address, symbol, decimals: Number(decimals) }
  }

  async #busy (what, fn) {
    if (this._busy) throw new Error('Bitte warten, eine Transaktion läuft noch.')
    this._busy = what
    this.#changed()
    try {
      return await fn()
    } finally {
      this._busy = null
      this.#changed()
    }
  }

  #changed () {
    this.emit('change')
  }

  #poll () {
    clearInterval(this._timer)
    const ms = this.pollMs ?? (this.net.dev ? 1500 : 8000)
    this._timer = setInterval(() => this.#changed(), ms)
  }

  async close () {
    clearInterval(this._timer)
    this._unwatch?.()
    this.wallet?.dispose()
    this.provider?.destroy()
    await this.p2p.close()
  }
}

function qrSvg (text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
}

// Re-exported for tests/scripts.
export { JsonRpcProvider }
