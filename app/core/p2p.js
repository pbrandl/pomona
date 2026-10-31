// The Pears layer. The organizer writes a small manifest (title, description,
// contract address, news) into a Hyperbee. Everyone who opens the invite link
// replicates it over Hyperswarm and also seeds it, so the round stays reachable
// even when the organizer's computer is off.
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import b4a from 'b4a'

const ENC = { keyEncoding: 'utf-8', valueEncoding: 'json' }

export class P2P {
  constructor (storage, { bootstrap, dht } = {}) {
    this.store = new Corestore(storage)
    this.swarm = new Hyperswarm(dht ? { dht } : bootstrap ? { bootstrap } : {})
    this.swarm.on('connection', (conn) => {
      this.store.replicate(conn)
      conn.on('error', () => {})
    })
    this.local = null
    this.manifest = null
    this.discovery = null
  }

  async ready () {
    await this.store.ready()
    // Private settings, never announced on the swarm (holds the wallet seed).
    const core = this.store.get({ name: 'local' })
    this.local = new Hyperbee(core, ENC)
    await this.local.ready()
    return this
  }

  get peers () {
    return this.swarm.connections.size
  }

  async getSetting (key) {
    return (await this.local.get(key))?.value ?? null
  }

  async setSetting (key, value) {
    if (value === null || value === undefined) await this.local.del(key)
    else await this.local.put(key, value)
  }

  // Organizer: create (or reopen) the writable manifest.
  async openOwnManifest () {
    const core = this.store.get({ name: 'manifest' })
    this.manifest = new Hyperbee(core, ENC)
    await this.manifest.ready()
    await this.#announce()
    return b4a.toString(core.key, 'hex')
  }

  // Bidder: open the organizer's manifest by key and wait for it to arrive.
  async openRemoteManifest (keyHex, { timeout = 30000 } = {}) {
    const core = this.store.get({ key: b4a.from(keyHex, 'hex') })
    this.manifest = new Hyperbee(core, ENC)
    await this.manifest.ready()
    await this.#announce()
    const round = await this.#waitFor('round', timeout)
    if (!round) throw new Error('Runde nicht gefunden. Ist mindestens ein Teilnehmer online?')
    return round
  }

  get writable () {
    return !!this.manifest?.core.writable
  }

  async putRound (round) {
    await this.manifest.put('round', round)
  }

  async getRound () {
    return (await this.manifest?.get('round'))?.value ?? null
  }

  async postNews (text) {
    const at = Date.now()
    await this.manifest.put('news/' + String(at).padStart(15, '0'), { text, at })
  }

  async news (limit = 20) {
    if (!this.manifest) return []
    const items = []
    for await (const { value } of this.manifest.createReadStream({ gt: 'news/', lt: 'news/~', reverse: true, limit })) {
      items.push(value)
    }
    return items
  }

  // Calls `fn` whenever the manifest grows (new news, edited round).
  onChange (fn) {
    const core = this.manifest.core
    core.on('append', fn)
    return () => core.off('append', fn)
  }

  async #announce () {
    const core = this.manifest.core
    if (this.discovery) return
    this.discovery = this.swarm.join(core.discoveryKey, { server: true, client: true })
    const done = core.findingPeers()
    this.swarm.flush().then(done, done)
    await this.discovery.flushed()
  }

  async #waitFor (key, timeout) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      await this.manifest.core.update({ wait: true }).catch(() => {})
      const node = this.manifest.core.length > 0
        ? await this.manifest.get(key, { timeout: 5000 }).catch(() => null)
        : null
      if (node) return node.value
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return null
  }

  async close () {
    await this.swarm.destroy()
    await this.store.close()
  }
}
