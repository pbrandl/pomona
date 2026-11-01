/**
 * Pomona application service: one bidding round per app instance.
 *
 * Owns the wallet (WDK), the Pears node and the chain connection, enforces the
 * business rules before anything is signed, and produces a plain JSON status
 * for the UI. The UI reaches it only through rpc/methods.js; tests drive it
 * directly.
 *
 * Events: 'change' (status may have changed), 'error' (background failure).
 *
 * @module core/pomona
 */
import { EventEmitter } from 'events'
import WDK from '@tetherto/wdk'
import { Wallet as KeyWallet, getBytes, isAddress, getAddress, id as topicOf, zeroPadValue } from 'ethers'
import qrcode from 'qrcode-generator'

import { getNetwork, networkIds, isReady, DEFAULT_NETWORK } from './config/networks.js'
import { LIMITS } from './config/limits.js'
import { providerFor } from './chain/provider.js'
import { RoundContract, FactoryContract, TokenContract } from './chain/contracts.js'
import { explain } from './chain/reverts.js'
import { openAccount, seal, open, checkPassword } from './wallet/index.js'
import { P2PNode } from './p2p/node.js'
import { encodeInvite, decodeInvite, encodeReceipt, decodeReceipt } from './links.js'
import { parseAmount, formatAmount } from './units.js'
import { INTERVALS, intervalName, canInvoice, dueAt, DAY } from './schedule.js'
import { PomonaError, fail } from './errors.js'
import { VERSION } from './version.js'
import { Assistant } from './agent/agent.js'
import { QvacEngine } from './agent/qvac.js'

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const TRANSFER = topicOf('Transfer(address,address,uint256)')

/**
 * @typedef {Object} PomonaOptions
 * @property {string} storage - directory for Corestore (Pear: Pear.app.storage)
 * @property {string} [defaultNetwork] - network used before a round exists
 * @property {Object<string, object>} [networkOverrides] - per-network config overrides (tests, local setups)
 * @property {boolean} [allowDev] - enable the local dev chain (only in `pear run --dev`)
 * @property {Array<{host: string, port: number}>} [bootstrap] - HyperDHT bootstrap (tests)
 * @property {object} [dht] - custom HyperDHT instance (tests)
 * @property {number} [pollMs] - how often to emit 'change' for chain updates
 * @property {() => import('./agent/qvac.js').Engine} [assistantEngine] - language model engine (tests inject a fake)
 */

/**
 * @typedef {Object} SavedRound
 * @property {'organizer'|'bidder'} role
 * @property {string} network
 * @property {string} manifest - hex key
 * @property {string} round    - contract address
 * @property {string|null} inviteKey
 */

export class Pomona extends EventEmitter {
  /** @param {PomonaOptions} opts */
  constructor ({ storage, defaultNetwork = 'local', networkOverrides = {}, allowDev = false, bootstrap, dht, pollMs, assistantEngine } = {}) {
    super()
    this.p2p = new P2PNode(storage, { bootstrap, dht })
    this.defaultNetwork = defaultNetwork
    this.overrides = networkOverrides
    this.allowDev = allowDev
    this.pollMs = pollMs

    /** @type {import('./config/networks.js').Network|null} */ this.net = null
    /** @type {import('ethers').JsonRpcProvider|null} */ this.provider = null
    /** @type {import('./wallet/account.js').Account|null} */ this.account = null
    /** @type {RoundContract|null} */ this.round = null
    /** @type {SavedRound|null} */ this.saved = null
    /** @type {import('./p2p/manifest.js').RoundManifest|null} */ this.manifest = null
    /** @type {{ address: string, symbol: string, decimals: number }|null} */ this.tokenMeta = null
    this.link = null
    this._sealed = null
    this._seedForReopen = null
    this._busy = null
    this._busyStep = null
    this._unwatchFunds = null

    // "Frag Pomona": explains and prepares, never signs (see core/agent).
    this.assistant = new Assistant({
      getStatus: () => this.status(),
      quoteBid: (p) => this.quoteBid(p),
      settings: { get: (k) => this.p2p.getSetting(k), set: (k, v) => this.p2p.setSetting(k, v) },
      engine: assistantEngine ?? (() => new QvacEngine({ cacheDir: storage + '/models' })),
      onChange: () => this._changed()
    })
    this._timer = null
    this._unwatch = null
    this._unwatchChain = null
  }

  // ---------------------------------------------------------------- lifecycle

  async ready () {
    await this.p2p.ready()
    this._sealed = await this.p2p.getSetting('vault')
    this.saved = await this.p2p.getSetting('round')
    await this.assistant.ready()
    this._useNetwork(this.saved?.network ?? this.defaultNetwork)
    // Restoring the round needs no password: reads and seeding work while locked.
    if (this.saved) await this._restore(this.saved, { wait: false }).catch((e) => this.emit('error', e))
    return this
  }

  async close () {
    clearInterval(this._timer)
    this._unwatch?.()
    this._unwatchChain?.()
    this._unwatchFunds?.()
    await this.assistant.close()
    this.account?.dispose()
    this.provider?.destroy()
    await this.p2p.close()
  }

  // ------------------------------------------------------------------- wallet

  /** @returns {'none'|'locked'|'unlocked'} */
  get walletState () {
    if (this.account) return 'unlocked'
    return this._sealed ? 'locked' : 'none'
  }

  /**
   * Creates a new wallet, stores the seed encrypted and returns it once so the
   * user can write it down.
   * @param {{ password: string }} p
   * @returns {Promise<{ seed: string, address: string }>}
   */
  async createWallet ({ password }) {
    if (this._sealed) fail('WALLET_EXISTS', 'Es gibt bereits eine Wallet.')
    checkPassword(password)
    const seed = WDK.getRandomSeedPhrase(12)
    await this._storeSeed(seed, password)
    return { seed, address: await this.account.address() }
  }

  /**
   * @param {{ seed: string, password: string }} p
   * @returns {Promise<{ address: string }>}
   */
  async restoreWallet ({ seed, password }) {
    // Never overwrite an existing vault: that could destroy access to funds.
    if (this._sealed) fail('WALLET_EXISTS', 'Es gibt bereits eine Wallet auf diesem Gerät.')
    seed = String(seed ?? '').slice(0, LIMITS.seed).trim().toLowerCase().split(/\s+/).join(' ')
    if (!WDK.isValidSeed(seed)) fail('BAD_SEED', 'Diese Wiederherstellungsphrase ist ungültig.')
    checkPassword(password)
    await this._storeSeed(seed, password)
    return { address: await this.account.address() }
  }

  /** @param {{ password: string }} p */
  async unlock ({ password }) {
    if (this.account) return { address: await this.account.address() }
    if (!this._sealed) fail('NO_WALLET', 'Es gibt noch keine Wallet.')
    this._openAccount(open(this._sealed, password))
    this._changed()
    return { address: await this.account.address() }
  }

  lock () {
    this.assistant.reset() // the conversation may contain personal details
    this._unwatchFunds?.()
    this._unwatchFunds = null
    this.account?.dispose()
    this.account = null
    this._seedForReopen = null
    this._changed()
  }

  /**
   * Requires the password again: a compromised UI cannot read the seed of an
   * unlocked wallet.
   * @param {{ password: string }} p
   */
  revealSeed ({ password }) {
    if (!this._sealed) fail('NO_WALLET', 'Es gibt noch keine Wallet.')
    return open(this._sealed, password)
  }

  /** Dev chain only: 5,000 test USDT. */
  async faucet () {
    this._needAccount()
    if (!this.net.dev) fail('NOT_DEV', 'Testguthaben gibt es nur auf der lokalen Entwicklungs-Chain.')
    await this.account.faucet(5000_000000n)
    this._changed()
  }

  /**
   * Sends USDT out of the wallet (e.g. the organizer moving invoiced funds).
   * The only way funds can leave to an arbitrary address, so it requires the
   * password again, like revealing the seed.
   * @param {{ to: string, amount: string, password: string }} p
   */
  async sendUsdt ({ to, amount, password }) {
    this._needAccount()
    open(this._sealed, password)
    if (!isAddress(String(to))) fail('BAD_ADDRESS', 'Bitte eine gültige Adresse (0x…) angeben.')
    const meta = await this._token()
    const units = parseAmount(amount, meta.decimals)
    if (units === 0n) fail('BAD_AMOUNT', 'Bitte einen Betrag eingeben.')
    if (await this.account.usdtBalance() < units) fail('NO_FUNDS', 'Nicht genug USDT.')
    return this._exclusive('send', (onStep) => this.account.sendUsdt(getAddress(to), units, { onStep }))
  }

  // -------------------------------------------------------------------- round

  /**
   * @param {Object} p
   * @param {string} p.title
   * @param {string} [p.description]
   * @param {string} [p.network]
   * @param {string} p.target        - per installment, e.g. "4.000"
   * @param {string} [p.minBid]      - per installment
   * @param {string} [p.guide]       - suggested bid per installment ("Richtwert"), shown to bidders
   * @param {'week'|'month'} p.interval
   * @param {number|string} p.installments - how often the organizer may invoice
   * @param {number} [p.biddingEnd]          - end of bidding, unix seconds (preferred)
   * @param {number|string} [p.biddingDays] - alternatively: days from now
   * @param {boolean} [p.inviteOnly]
   * @returns {Promise<{ link: string }>}
   */
  async createRound (p) {
    this._needAccount()
    if (this.round) fail('HAS_ROUND', 'Diese App hat bereits eine Runde.')
    const title = String(p.title ?? '').trim().slice(0, LIMITS.title)
    const description = String(p.description ?? '').trim().slice(0, LIMITS.description)
    if (!title) fail('BAD_INPUT', 'Bitte gib der Runde einen Namen.')
    if (!Object.hasOwn(INTERVALS, p.interval)) fail('BAD_INPUT', 'Bitte Woche oder Monat als Intervall wählen.')
    const installments = Number(p.installments)
    if (!Number.isInteger(installments) || installments < 1 || installments > LIMITS.maxInstallments) {
      fail('BAD_INPUT', `Anzahl der Rechnungen: 1 bis ${LIMITS.maxInstallments}.`)
    }

    if (p.network && p.network !== this.net.id) this._useNetwork(p.network, { reopen: true })
    if (!isReady(this.net)) fail('NOT_READY', 'Dieses Netzwerk ist noch nicht eingerichtet.')

    const meta = await this._token()
    const target = parseAmount(p.target, meta.decimals, 'Zielbetrag')
    if (target === 0n) fail('BAD_INPUT', 'Der Zielbetrag muss größer als 0 sein.')
    const minBid = p.minBid ? parseAmount(p.minBid, meta.decimals, 'Mindestgebot') : 0n
    const guide = p.guide ? parseAmount(p.guide, meta.decimals, 'Richtwert') : 0n
    if (guide > 0n && guide < minBid) fail('BAD_INPUT', 'Der Richtwert darf nicht unter dem Mindestgebot liegen.')
    const now = (await this.provider.getBlock('latest')).timestamp
    const biddingEnd = p.biddingEnd != null ? Math.floor(Number(p.biddingEnd)) : now + Math.round(Number(p.biddingDays) * DAY)
    if (!(biddingEnd >= now + 3600)) fail('BAD_INPUT', 'Die Bietphase muss mindestens eine Stunde dauern.')
    if (biddingEnd > now + LIMITS.maxBiddingDays * DAY) fail('BAD_INPUT', `Die Bietphase darf höchstens ${LIMITS.maxBiddingDays} Tage dauern.`)
    const invite = p.inviteOnly !== false ? KeyWallet.createRandom() : null
    const factory = new FactoryContract(this.net.factory, this.provider)
    const me = await this.account.address()

    const address = await this._exclusive('create', async (onStep) => {
      const before = await factory.roundsOf(me)
      await this.account.execute([factory.createRound({
        target,
        minBid,
        biddingEnd,
        interval: INTERVALS[p.interval],
        installments,
        inviteSigner: invite?.address ?? null
      })], { onStep })
      const after = await factory.roundsOf(me)
      if (after.length !== before.length + 1) fail('TX_FAILED', 'Runde wurde nicht erstellt.')
      return after.at(-1)
    })

    const manifest = await this.p2p.openOwnManifest()
    await this.p2p.putRound({
      v: 1,
      title,
      description,
      network: this.net.id,
      chainId: this.net.chainId,
      round: address,
      organizer: me,
      guide: guide > 0n ? formatAmount(guide, meta.decimals) : null,
      createdAt: Date.now()
    })
    const saved = { role: 'organizer', network: this.net.id, manifest, round: address, inviteKey: invite?.privateKey ?? null }
    await this.p2p.setSetting('round', saved)
    await this._restore(saved)
    return { link: this.link }
  }

  /**
   * Joins a round from an invite link, after checking that it is genuine:
   * created by our factory, settled in USDT, and the manifest names the same
   * organizer as the contract.
   * @param {{ link: string }} p
   */
  async join ({ link }) {
    this._needAccount()
    if (this.round) fail('HAS_ROUND', 'Diese App hat bereits eine Runde.')
    const inv = decodeInvite(link)
    if (!networkIds().includes(inv.network)) fail('BAD_LINK', 'Unbekanntes Netzwerk im Link.')
    this._useNetwork(inv.network, { reopen: true })
    if (!isReady(this.net)) fail('NOT_READY', 'Dieses Netzwerk ist in deiner App noch nicht eingerichtet.')
    await this._verifyRound(inv.round)
    if (inv.inviteKey) {
      const info = await new RoundContract(inv.round, this.provider).info()
      if (!same(new KeyWallet(inv.inviteKey).address, info.inviteSigner)) fail('BAD_LINK', 'Die Einladung passt nicht zu dieser Runde.')
    }
    const manifest = await this.p2p.openRemoteManifest(inv.manifest)
    if (!same(manifest.round, inv.round) || manifest.chainId !== this.net.chainId) fail('BAD_LINK', 'Link und Runde passen nicht zusammen.')
    const saved = { role: 'bidder', network: inv.network, manifest: inv.manifest, round: inv.round, inviteKey: inv.inviteKey }
    await this.p2p.setSetting('round', saved)
    await this._restore(saved)
    return this.status()
  }

  /**
   * What a bid would mean, before the user commits: deposit, fee in USDT,
   * whether the balance suffices. Used by the confirmation step in the UI.
   * @param {{ amount: string }} p
   * @returns {Promise<{ amount: string, pledgeAfter: string, installments: number, deposit: string,
   *   fee: string|null, balance: string, enough: boolean, missing: string, symbol: string }>}
   */
  async quoteBid ({ amount }) {
    const b = await this._prepareBid(amount)
    const fee = b.enough ? await this.account.quoteFee(b.calls).catch(() => null) : null
    const fmt = (v) => formatAmount(v, b.meta.decimals)
    return {
      amount: fmt(b.units),
      pledgeAfter: fmt(b.previous + b.units),
      installments: b.info.installments,
      deposit: fmt(b.cost),
      fee: fee === null ? null : fmt(fee),
      balance: fmt(b.balance),
      enough: b.enough,
      missing: fmt(b.enough ? 0n : b.cost - b.balance),
      symbol: b.meta.symbol
    }
  }

  /**
   * Bid (or raise) `amount` per installment. Deposits amount × installments.
   * Approve and bid go out as one user operation on smart accounts.
   * @param {{ amount: string }} p
   */
  async bid ({ amount }) {
    const b = await this._prepareBid(amount)
    if (!b.enough) {
      fail('NO_FUNDS', `Dafür brauchst du ${formatAmount(b.cost, b.meta.decimals)} ${b.meta.symbol}. Dir fehlen ${formatAmount(b.cost - b.balance, b.meta.decimals)} ${b.meta.symbol}.`)
    }
    await this._exclusive('bid', (onStep) => this.account.execute(b.calls, { onStep }))
  }

  /**
   * Validates a bid and builds its calls (approve + bid). Throws for rule
   * violations; reports a missing balance via `enough` instead.
   * @private
   */
  async _prepareBid (amount) {
    const { info, me } = await this._roundContext('bidding')
    const meta = await this._token()
    const units = parseAmount(amount, meta.decimals)
    if (units === 0n) fail('BAD_AMOUNT', 'Bitte einen Betrag eingeben.')
    const previous = await this.round.pledgeOf(me)
    if (previous + units < info.minBid) fail('BELOW_MIN', `Das Mindestgebot ist ${formatAmount(info.minBid, meta.decimals)} ${meta.symbol} pro Rate.`)
    const cost = units * BigInt(info.installments)
    const balance = await this.account.usdtBalance()

    let invite = '0x'
    if (previous === 0n && info.inviteSigner) {
      if (!this.saved.inviteKey) fail('NO_INVITE', 'Für diese Runde brauchst du den Einladungslink.')
      const signer = new KeyWallet(this.saved.inviteKey)
      if (!same(signer.address, info.inviteSigner)) fail('NO_INVITE', 'Die Einladung passt nicht zu dieser Runde.')
      invite = await signer.signMessage(getBytes(await this.round.inviteDigest(me)))
    }

    const token = new TokenContract(meta.address, this.provider)
    const allowance = await token.allowance(me, this.round.address)
    const calls = []
    if (allowance < cost) {
      // USDT on Ethereum requires resetting a non-zero allowance to 0 first.
      if (allowance !== 0n) calls.push(token.approve(this.round.address, 0n))
      calls.push(token.approve(this.round.address, cost))
    }
    calls.push(this.round.bid(units, invite))
    return { info, meta, units, previous, cost, balance, enough: balance >= cost, calls }
  }

  /**
   * Lower or withdraw a bid (per installment) while bidding is open.
   * @param {{ amount: string|'all' }} p
   */
  async withdraw ({ amount = 'all' } = {}) {
    const { me } = await this._roundContext('bidding')
    const meta = await this._token()
    const units = amount === 'all' ? await this.round.pledgeOf(me) : parseAmount(amount, meta.decimals)
    if (units === 0n) fail('NOTHING', 'Du hast kein Gebot.')
    await this._simulateAndRun('withdraw', this.round.withdraw(units))
  }

  /** Organizer: release the next installment of all bids. */
  async invoice () {
    const { info, now } = await this._roundContext('running', { organizer: true })
    if (!canInvoice(info, now)) fail('NOT_DUE', 'Die nächste Rechnung ist noch nicht fällig.')
    await this._simulateAndRun('invoice', this.round.invoice())
  }

  /** Organizer: abort during bidding (full refunds). */
  async cancel () {
    await this._roundContext('bidding', { organizer: true })
    await this._simulateAndRun('cancel', this.round.cancel())
  }

  /** Organizer: stop invoicing early (refunds of the rest). */
  async terminate () {
    await this._roundContext('running', { organizer: true })
    await this._simulateAndRun('terminate', this.round.terminate())
  }

  /** Bidder: take back what was not invoiced. */
  async refund () {
    const { me } = await this._roundContext(null)
    if (await this.round.refundable(me) === 0n) fail('NOTHING', 'Es gibt nichts zurückzuzahlen.')
    await this._simulateAndRun('refund', this.round.refund())
  }

  /** @param {{ text: string }} p */
  async postNews ({ text }) {
    if (this.saved?.role !== 'organizer') fail('NOT_ORGANIZER', 'Nur der Organisator kann Neuigkeiten posten.')
    text = String(text ?? '').trim().slice(0, LIMITS.news)
    if (text) await this.p2p.postNews(text)
  }

  /** @returns {{ link: string, qr: string }} organizer only */
  invite () {
    if (this.saved?.role !== 'organizer') fail('NOT_ORGANIZER', 'Nur der Organisator teilt die Einladung.')
    return { link: this.link, qr: qrSvg(this.link) }
  }

  /**
   * A shareable proof that this wallet paid installment `index`.
   * @param {{ index: number }} p
   * @returns {Promise<{ code: string, qr: string }>}
   */
  async receipt ({ index }) {
    this._needAccount()
    if (!this.round) fail('NO_ROUND', 'Noch keine Runde.')
    const me = await this.account.address()
    const r = await this.round.receipt(me, Number(index))
    if (r.amount === 0n) fail('NO_RECEIPT', 'Für diese Rate gibt es keinen Beleg.')
    const code = encodeReceipt({ network: this.net.id, round: this.round.address, bidder: me, index: Number(index) })
    return { code, qr: qrSvg(code) }
  }

  /**
   * Checks a receipt against the chain. Anyone can do this, no wallet needed.
   * @param {{ code: string }} p
   */
  async verifyReceipt ({ code }) {
    const r = decodeReceipt(code)
    if (!networkIds().includes(r.network)) fail('BAD_LINK', 'Unbekanntes Netzwerk im Beleg.')
    const net = this._network(r.network)
    const own = net.id === this.net.id
    const provider = own ? this.provider : providerFor(net)
    try {
      if (!net.factory || !(await new FactoryContract(net.factory, provider).isRound(r.round))) {
        return { valid: false, reason: 'Diese Runde wurde nicht mit Pomona erstellt.' }
      }
      const round = new RoundContract(r.round, provider)
      const [{ amount, paidAt }, info] = await Promise.all([round.receipt(r.bidder, r.index), round.info()])
      const meta = await new TokenContract(info.token, provider).meta()
      const title = own && same(r.round, this.round?.address) ? this.manifest?.title ?? null : null
      if (amount === 0n) return { valid: false, reason: 'Für diese Rate ist keine Zahlung verbucht.', title }
      return {
        valid: true,
        title,
        round: r.round,
        bidder: r.bidder,
        installment: r.index + 1,
        installments: info.installments,
        amount: formatAmount(amount, meta.decimals),
        symbol: meta.symbol,
        paidAt
      }
    } finally {
      if (!own) provider.destroy()
    }
  }

  // ------------------------------------------------------------------- status

  /** Plain-JSON snapshot for the UI. See docs/RPC.md. */
  async status () {
    const s = {
      wallet: { state: this.walletState, kind: this.account?.kind ?? null, address: null, usdt: null, symbol: 'USDT' },
      network: { id: this.net.id, name: this.net.name, dev: !!this.net.dev, explorer: this.net.explorer },
      networks: networkIds()
        .filter((id) => this.allowDev || !getNetwork(id).dev)
        .map((id) => { const n = this._network(id); return { id, name: n.name, ready: isReady(n) } }),
      peers: this.p2p.peers,
      version: VERSION,
      busy: this._busy,
      busyStep: this._busyStep, // 'prepare' | 'sign' | 'confirm' while a transaction runs
      round: null
    }
    s.assistant = null // filled at the end (needs the round)
    const meta = this.tokenMeta ?? (this.net.token ? await this._token().catch(() => null) : null)
    const fmt = (v) => formatAmount(v, meta?.decimals ?? 6)
    const me = this.account ? await this.account.address() : null
    if (me) {
      s.wallet.address = me
      s.wallet.usdt = await this.account.usdtBalance().then(fmt, () => null)
      s.wallet.symbol = meta?.symbol ?? 'USDT'
    }
    if (!this.round) {
      s.assistant = this.assistant.info(s)
      return s
    }

    const info = await this.round.info()
    const now = (await this.provider.getBlock('latest')).timestamp
    const [pledge, refundable, news] = await Promise.all([
      me ? this.round.pledgeOf(me) : 0n,
      me ? this.round.refundable(me) : 0n,
      this.p2p.news()
    ])
    const invoices = await this._invoices(info, now, pledge, fmt)
    s.round = {
      role: this.saved.role,
      title: this.manifest?.title ?? '',
      description: this.manifest?.description ?? '',
      guide: this.manifest?.guide ?? null,
      verified: !!this.manifest && same(this.manifest.organizer, info.organizer),
      address: info.address,
      organizer: info.organizer,
      symbol: meta.symbol,
      target: fmt(info.target),
      total: fmt(info.total),
      minBid: fmt(info.minBid),
      progress: Number((info.total * 10000n) / info.target) / 10000,
      interval: info.interval,
      intervalName: intervalName(info.interval),
      installments: info.installments,
      invoiceCount: info.invoiceCount,
      // Start of bidding comes from the manifest (display only); the end from the contract.
      biddingStart: this.manifest?.createdAt ? Math.floor(this.manifest.createdAt / 1000) : null,
      biddingEnd: info.biddingEnd,
      nextInvoiceAt: info.nextInvoiceAt,
      expiresAt: info.expiresAt,
      now,
      phase: info.phase,
      canInvoice: canInvoice(info, now),
      inviteOnly: !!info.inviteSigner,
      bidders: info.bidderCount,
      myPledge: fmt(pledge),
      myDeposit: fmt(pledge * BigInt(info.installments)),
      refundable: fmt(refundable),
      invoices,
      news
    }
    s.assistant = this.assistant.info(s)
    return s
  }

  // ---------------------------------------------------------------- assistant

  /** @param {{ text?: string, topic?: string }} p */
  assistantAsk (p) { return this.assistant.ask(p) }

  /** @param {{ model?: 'small'|'better' }} p */
  assistantInstall (p) { return this.assistant.install(p) }

  assistantReset () { this.assistant.reset() }

  // ------------------------------------------------------------------ helpers

  /**
   * The installment plan as the UI shows it: one entry per invoice the
   * organizer may issue.
   *  - status 'paid'      invoiced; `paidAt` set; bidders have a receipt
   *  - status 'due'       the organizer can invoice it now
   *  - status 'scheduled' planned for `dueAt`
   *  - status 'void'      will never be invoiced (round failed, ended or expired)
   * `amount` is the caller's share if they bid, otherwise the round total per installment.
   * @private
   */
  async _invoices (info, now, pledge, fmt) {
    const paidAt = await Promise.all(Array.from({ length: info.invoiceCount }, (_, i) => this.round.invoicedAt(i)))
    const amount = fmt(pledge > 0n ? pledge : info.total)
    const open = info.phase === 'bidding' || info.phase === 'running'
    return Array.from({ length: info.installments }, (_, i) => {
      let status = 'void'
      if (i < info.invoiceCount) status = 'paid'
      else if (info.phase === 'running' && i === info.invoiceCount && canInvoice(info, now)) status = 'due'
      else if (open) status = 'scheduled'
      return { index: i, dueAt: dueAt(info, i), paidAt: paidAt[i] ?? null, amount, status, mine: pledge > 0n }
    })
  }

  /** @private */
  _network (id) {
    const net = getNetwork(id, this.overrides[id])
    if (net.dev && !this.allowDev) fail('NOT_DEV', 'Die Entwicklungs-Chain ist nur im Entwicklermodus verfügbar.')
    return net
  }

  /** @private */
  _useNetwork (id, { reopen = false } = {}) {
    if (this.net?.id === id) return
    let net
    try {
      net = this._network(id)
    } catch (e) {
      if (this.net || id === DEFAULT_NETWORK) throw e
      net = this._network(DEFAULT_NETWORK) // e.g. 'local' saved, but app started without --dev
    }
    this.net = net
    this.tokenMeta = null
    this.provider?.destroy()
    this.provider = providerFor(net)
    if (reopen && this.account) {
      // Accounts are bound to a network (provider, paymaster, policy targets).
      const seed = this._seedForReopen
      this.account.dispose()
      this.account = null
      if (seed) this._openAccount(seed)
    }
  }

  /** @private */
  _openAccount (seed) {
    this.account?.dispose()
    // Kept only while unlocked, to rebind the account when the network changes.
    this._seedForReopen = seed
    this.account = openAccount({
      seed,
      net: this.net,
      provider: this.provider,
      targets: {
        token: () => this.net.token,
        factory: () => this.net.factory,
        round: () => this.round?.address ?? null
      }
    })
    this._watchFunds()
  }

  /**
   * Live detection of incoming USDT: watches Transfer events to our address,
   * so "Guthaben aufladen" can confirm a deposit within seconds.
   * @private
   */
  _watchFunds () {
    this._unwatchFunds?.()
    this._unwatchFunds = null
    const account = this.account
    const provider = this.provider
    if (!account || !this.net.token) return
    account.address().then((me) => {
      if (this.account !== account) return // locked or replaced meanwhile
      const filter = { address: this.net.token, topics: [TRANSFER, null, zeroPadValue(me, 32)] }
      const fn = () => { this.emit('funds'); this._changed() }
      provider.on(filter, fn)
      this._unwatchFunds = () => { provider.off(filter, fn).catch?.(() => {}) }
    }, () => {})
  }

  /** @private */
  async _storeSeed (seed, password) {
    const sealed = seal(seed, password)
    await this.p2p.setSetting('vault', sealed)
    this._sealed = sealed
    this._openAccount(seed)
    this._changed()
  }

  /** @private */
  async _restore (saved, { wait = true } = {}) {
    this._useNetwork(saved.network)
    this.saved = saved
    this.link = encodeInvite({ manifest: saved.manifest, network: saved.network, round: saved.round, inviteKey: saved.inviteKey })
    if (!this.p2p.manifest) {
      if (saved.role === 'organizer') await this.p2p.openOwnManifest()
      else if (wait) await this.p2p.openRemoteManifest(saved.manifest)
      else this.p2p.openRemoteManifest(saved.manifest).then(() => this._refreshManifest(), () => {})
    }
    this.round = new RoundContract(saved.round, this.provider)
    await this._refreshManifest()
    this._unwatch?.()
    if (this.p2p.manifest) this._unwatch = this.p2p.onChange(() => this._refreshManifest())
    // Live updates: every contract event (new bid, invoice, …) triggers a refresh.
    this._unwatchChain?.()
    this._unwatchChain = this.round.watch(() => this._changed())
    this._poll()
    this._changed()
  }

  /** @private */
  async _refreshManifest () {
    this.manifest = await this.p2p.getRound().catch(() => null) ?? this.manifest
    this._changed()
  }

  /**
   * Refuses look-alike contracts: the round must come from the configured
   * factory and be settled in the network's USDT.
   * @private
   */
  async _verifyRound (address) {
    const factory = new FactoryContract(this.net.factory, this.provider)
    if (!(await factory.isRound(address))) {
      fail('FORGED_ROUND', 'Diese Runde wurde nicht von der Pomona-Factory erstellt. Bitte nicht bieten.')
    }
    const info = await new RoundContract(address, this.provider).info()
    if (!same(info.token, this.net.token)) fail('FORGED_ROUND', 'Diese Runde läuft nicht in USDT.')
    return info
  }

  /** @private */
  async _token () {
    if (!this.tokenMeta) this.tokenMeta = await new TokenContract(this.net.token, this.provider).meta()
    return this.tokenMeta
  }

  /** @private */
  _needAccount () {
    if (!this.account) fail(this._sealed ? 'LOCKED' : 'NO_WALLET', this._sealed ? 'Die Wallet ist gesperrt.' : 'Bitte zuerst eine Wallet anlegen.')
  }

  /**
   * Common preconditions for round actions.
   * @private
   * @param {string|null} phase - required phase, or null for any
   * @param {{ organizer?: boolean }} [opts]
   */
  async _roundContext (phase, { organizer = false } = {}) {
    this._needAccount()
    if (!this.round) fail('NO_ROUND', 'Noch keine Runde.')
    const [info, me, block] = await Promise.all([this.round.info(), this.account.address(), this.provider.getBlock('latest')])
    if (organizer && !same(info.organizer, me)) fail('NOT_ORGANIZER', 'Nur der Organisator darf das.')
    if (phase && info.phase !== phase) fail('WRONG_PHASE', 'Das ist in der aktuellen Phase der Runde nicht möglich.')
    return { info, me, now: block.timestamp }
  }

  /**
   * Dry-runs a single call from the wallet's address so the user gets a clear
   * reason instead of a failed (and paid) transaction, then executes it.
   * @private
   */
  async _simulateAndRun (what, call) {
    const from = await this.account.address()
    try {
      await this.provider.call({ ...call, from })
    } catch (e) {
      throw explain(e)
    }
    await this._exclusive(what, (onStep) => this.account.execute([call], { onStep }))
  }

  /**
   * One transaction at a time. The UI shows `busy` and the progress
   * `busyStep`: 'prepare' → 'sign' → 'confirm'.
   * @private
   * @param {string} what
   * @param {(onStep: (step: string) => void) => Promise<any>} fn
   */
  async _exclusive (what, fn) {
    if (this._busy) fail('BUSY', 'Bitte warten, eine Transaktion läuft noch.')
    this._busy = what
    this._busyStep = 'prepare'
    this._changed()
    const onStep = (step) => { this._busyStep = step; this._changed() }
    try {
      return await fn(onStep)
    } catch (e) {
      throw e instanceof PomonaError ? e : explain(e)
    } finally {
      this._busy = null
      this._busyStep = null
      this._changed()
    }
  }

  /** @private */
  _changed () {
    this.emit('change')
  }

  /** @private */
  _poll () {
    clearInterval(this._timer)
    // Fallback only: events arrive through watch(). This keeps countdowns and
    // due dates fresh even when nothing happens on-chain.
    this._timer = setInterval(() => this._changed(), this.pollMs ?? 15000)
  }
}

/** @param {string} text @returns {string} SVG markup (generated locally, no user HTML) */
export function qrSvg (text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
}
