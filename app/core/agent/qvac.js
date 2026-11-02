/**
 * Language model engine on Tether's QVAC (`@qvac/inference`, llama.cpp).
 * Runs in-process in the Bare worker; the model is downloaded once,
 * peer-to-peer from the QVAC registry, into the app's storage and then works
 * offline. Nothing of the conversation leaves the device.
 *
 * QVAC is imported lazily, so the rest of Pomona (and the Node tests) never
 * load the native addon unless the assistant is used.
 *
 * @module core/agent/qvac
 */

/** Models offered to the user. Ids are QVAC registry constants. */
export const MODELS = {
  small: { id: 'QWEN3_1_7B_INST_Q4', label: 'Kompakt', size: '1,1 GB', note: 'schnell, für die meisten Fragen' },
  better: { id: 'QWEN3_4B_INST_Q4_K_M', label: 'Genauer', size: '2,5 GB', note: 'versteht mehr, braucht etwa 4 GB Arbeitsspeicher' }
}

/**
 * @typedef {Object} Engine
 * @property {(key: string, onProgress: (ratio: number) => void) => Promise<void>} load
 * @property {(p: { messages: object[], tools: object[] }) => Promise<{ text: string, toolCalls: object[] }>} chat
 * @property {() => Promise<void>} close
 */

/** @implements {Engine} */
export class QvacEngine {
  /**
   * @param {Object} opts
   * @param {string} opts.cacheDir - absolute directory for downloaded model files
   * @param {string} [opts.localDir] - folder with model files downloaded by hand
   *   (e.g. from Hugging Face in a browser). A file named like the registry's
   *   model file is used instead of the peer-to-peer download, but only after
   *   its SHA-256 matches the registry's checksum.
   * @param {boolean} [opts.localOnly] - never download; a missing file is an error
   *   that says where to put it (networks that block peer-to-peer traffic)
   */
  constructor ({ cacheDir, localDir = null, localOnly = false }) {
    this.cacheDir = cacheDir
    this.localDir = localDir
    this.localOnly = localOnly
    this.api = null
    this.modelId = null
  }

  /** @private Loads QVAC once and points its model cache into our storage. */
  async _api () {
    if (this.api) return this.api
    const fs = await import('fs')
    const { default: env } = await import('bare-env')
    fs.mkdirSync(this.cacheDir, { recursive: true })
    const configPath = this.cacheDir + '/qvac.config.json'
    fs.writeFileSync(configPath, JSON.stringify({ cacheDirectory: this.cacheDir }))
    env.QVAC_CONFIG_PATH = configPath
    const api = await import('@qvac/inference')
    const { llmPlugin } = await import('@qvac/inference/llamacpp-completion/plugin')
    const models = await import('@qvac/inference/models')
    if (!api.hasPlugin?.(llmPlugin.modelType)) api.registerPlugin(llmPlugin)
    this.api = { ...api, models }
    return this.api
  }

  async load (key, onProgress = () => {}) {
    const q = await this._api()
    const spec = MODELS[key]
    if (!spec) throw new Error('Unbekanntes Modell: ' + key)
    if (this.modelId) await q.unloadModel({ modelId: this.modelId }).catch(() => {})
    const descriptor = q.models[spec.id]
    const local = await this._localFile(descriptor, onProgress)
    this.modelId = await q.loadModel({
      ...(local ? { modelSrc: local, modelType: descriptor.engine } : { modelSrc: descriptor }),
      onProgress: (p) => {
        const ratio = Number.isFinite(p?.percentage) ? p.percentage / 100 : p?.total ? p.downloaded / p.total : null
        if (ratio !== null) onProgress(Math.max(0, Math.min(1, ratio)))
      }
    })
  }

  /**
   * @private Path of a hand-downloaded model file in `localDir`, or null.
   * Hashes the file once (progress 0…1) and remembers the result by size and
   * modification time, so a swapped file is checked again.
   */
  async _localFile (descriptor, onProgress) {
    if (!this.localDir) return null
    const fs = await import('fs')
    const path = this.localDir + '/' + descriptor.modelId
    let st
    try { st = fs.statSync(path) } catch {
      if (this.localOnly) throw new Error(`Modelldatei fehlt. Bitte ${descriptor.modelId} herunterladen und in ${this.localDir} ablegen (siehe docs/DEV.md).`)
      return null
    }
    if (st.size !== descriptor.expectedSize) {
      throw new Error(`${descriptor.modelId} in ${this.localDir} hat die falsche Größe (${st.size} statt ${descriptor.expectedSize} Bytes). Bitte die Datei neu herunterladen.`)
    }
    const stamp = `${descriptor.sha256Checksum}:${st.size}:${Math.floor(st.mtimeMs)}`
    const marker = this.cacheDir + '/verified-' + descriptor.modelId + '.txt'
    let known = null
    try { known = fs.readFileSync(marker, 'utf8') } catch {}
    if (known !== stamp) {
      const sha = await sha256File(fs, path, st.size, onProgress)
      if (sha !== descriptor.sha256Checksum) {
        throw new Error(`${descriptor.modelId} in ${this.localDir} hat eine falsche Prüfsumme. Die Datei ist beschädigt oder nicht das erwartete Modell.`)
      }
      fs.mkdirSync(this.cacheDir, { recursive: true })
      fs.writeFileSync(marker, stamp)
    }
    onProgress(1)
    return path
  }

  async chat ({ messages, tools }) {
    if (!this.modelId) throw new Error('Kein Modell geladen.')
    const run = this.api.completion({ modelId: this.modelId, history: messages, tools, stream: false, captureThinking: true })
    const final = await run.final
    return {
      text: final.contentText ?? '',
      toolCalls: (final.toolCalls || []).map((c) => ({ id: c.id, name: c.name, arguments: c.arguments || {} }))
    }
  }

  async close () {
    if (!this.api) return
    if (this.modelId) await this.api.unloadModel({ modelId: this.modelId }).catch(() => {})
    this.modelId = null
    await this.api.close().catch(() => {})
    this.api = null
  }
}

/** Streams a file through SHA-256 (works in Node and Bare). */
async function sha256File (fs, path, size, onProgress) {
  const { createHash } = await import('crypto')
  const hash = createHash('sha256')
  let done = 0
  let last = 0
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(path)
    s.on('data', (chunk) => {
      hash.update(chunk)
      done += chunk.length
      if (done - last > 32 * 1024 * 1024) { last = done; onProgress(Math.min(0.99, done / size)) }
    })
    s.on('error', reject)
    s.on('end', resolve)
  })
  return hash.digest('hex')
}
