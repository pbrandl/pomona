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
  /** @param {{ cacheDir: string }} opts - absolute directory for model files */
  constructor ({ cacheDir }) {
    this.cacheDir = cacheDir
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
    this.modelId = await q.loadModel({
      modelSrc: q.models[spec.id],
      onProgress: (p) => {
        const ratio = Number.isFinite(p?.percentage) ? p.percentage / 100 : p?.total ? p.downloaded / p.total : null
        if (ratio !== null) onProgress(Math.max(0, Math.min(1, ratio)))
      }
    })
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
