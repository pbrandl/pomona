/**
 * The Pears layer: Corestore + Hyperswarm + Hyperbee.
 *
 *  - `local`: a private Hyperbee for settings (encrypted seed, the joined
 *    round). It is never announced on the swarm.
 *  - `manifest`: the round manifest (see manifest.js). The organizer writes it,
 *    every participant replicates and seeds it, so the round stays reachable
 *    while the organizer's computer is off.
 *
 * Privacy note: peers on the same topic see each other's IP addresses.
 *
 * @module core/p2p/node
 */
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import b4a from 'b4a'
import { sanitizeManifest, sanitizeNews, newsKey } from './manifest.js'
import { LIMITS } from '../config/limits.js'
import { fail } from '../errors.js'

const ENC = { keyEncoding: 'utf-8', valueEncoding: 'json' }

export class P2PNode {
  /**
   * @param {string} storage - directory (desktop: `<userData>/storage`)
   * @param {{ bootstrap?: Array<{host: string, port: number}>, dht?: object }} [opts]
   *   Tests pass a local testnet; production uses the public HyperDHT.
   */
  constructor (storage, { bootstrap, dht } = {}) {
    this.store = new Corestore(storage)
    this.swarm = new Hyperswarm(dht ? { dht } : bootstrap ? { bootstrap } : {})
    this.swarm.on('connection', (conn) => {
      conn.on('error', () => {}) // peers come and go; never crash on them
      this.store.replicate(conn)
    })
    /** @type {Hyperbee|null} */ this.local = null
    /** @type {Hyperbee|null} */ this.manifest = null
    this._discovery = null
  }

  async ready () {
    await this.store.ready()
    this.local = new Hyperbee(this.store.get({ name: 'local' }), ENC)
    await this.local.ready()
    return this
  }

  /** Number of open peer connections. */
  get peers () {
    return this.swarm.connections.size
  }

  /** @param {string} key */
  async getSetting (key) {
    return (await this.local.get(key))?.value ?? null
  }

  /** @param {string} key @param {unknown} value - null deletes */
  async setSetting (key, value) {
    if (value === null || value === undefined) await this.local.del(key)
    else await this.local.put(key, value)
  }

  /**
   * Organizer: open (or reopen) the writable manifest and announce it.
   * @returns {Promise<string>} hex key to put into the invite link
   */
  async openOwnManifest () {
    const core = this.store.get({ name: 'manifest' })
    this.manifest = new Hyperbee(core, ENC)
    await this.manifest.ready()
    await this._announce()
    return b4a.toString(core.key, 'hex')
  }

  /**
   * Bidder: open the organizer's manifest by key and wait until it arrived
   * from any peer that has it.
   * @param {string} keyHex
   * @param {{ timeout?: number }} [opts]
   * @returns {Promise<import('./manifest.js').RoundManifest>}
   */
  async openRemoteManifest (keyHex, { timeout = 30000 } = {}) {
    const core = this.store.get({ key: b4a.from(keyHex, 'hex') })
    this.manifest = new Hyperbee(core, ENC)
    await this.manifest.ready()
    // Keep a full live copy: news arrive as soon as they are posted, and we can
    // serve the whole manifest to others (seeding).
    core.download({ start: 0, end: -1 })
    await this._announce()
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      await core.update({ wait: true }).catch(() => {})
      if (core.length > 0) {
        const m = await this.getRound({ timeout: 5000 })
        if (m) return m
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return fail('NO_PEERS', 'noPeers')
  }

  get writable () {
    return !!this.manifest?.core.writable
  }

  /** @param {import('./manifest.js').RoundManifest} round */
  async putRound (round) {
    await this.manifest.put('round', round)
  }

  /** @returns {Promise<import('./manifest.js').RoundManifest|null>} */
  async getRound ({ timeout } = {}) {
    const node = await this.manifest?.get('round', timeout ? { timeout } : undefined).catch(() => null)
    return sanitizeManifest(node?.value)
  }

  /** @param {string} text */
  async postNews (text) {
    const at = Date.now()
    await this.manifest.put(newsKey(at), { text: String(text).slice(0, LIMITS.news), at })
  }

  /** @returns {Promise<Array<{ text: string, at: number }>>} newest first */
  async news () {
    if (!this.manifest || this.manifest.core.length === 0) return []
    const items = []
    const stream = this.manifest.createReadStream({ gt: 'news/', lt: 'news/~', reverse: true, limit: LIMITS.newsShown })
    for await (const { value } of stream) {
      const n = sanitizeNews(value)
      if (n) items.push(n)
    }
    return items
  }

  /**
   * @param {() => void} fn - called whenever the manifest grows
   * @returns {() => void} unsubscribe
   */
  onChange (fn) {
    const core = this.manifest.core
    core.on('append', fn)
    return () => core.off('append', fn)
  }

  /** @private */
  async _announce () {
    if (this._discovery) return
    const core = this.manifest.core
    this._discovery = this.swarm.join(core.discoveryKey, { server: true, client: true })
    const done = core.findingPeers()
    this.swarm.flush().then(done, done)
    await this._discovery.flushed()
  }

  async close () {
    await this.swarm.destroy()
    await this.store.close()
  }
}
