/**
 * "Frag Pomona": the assistant that sits on top of the app.
 *
 * Answers come from three sources, in this order:
 *   1. topic   – a suggestion button: fixed, reviewed answer (knowledge.js)
 *   2. rules   – a clear command like "biete 100" (intents.js), no model needed
 *   3. model   – free questions, through a local QVAC language model with tools
 *   (fallback: keyword match on the knowledge base)
 *
 * Whatever the source, the result is text plus *proposed* actions. Actions are
 * validated against the current status and only open pages of the app; the
 * person confirms every transaction there. The assistant cannot sign.
 *
 * @module core/agent/agent
 */
import { answerTopic, matchTopic, suggestions } from './knowledge.js'
import { matchIntent } from './intents.js'
import { systemPrompt, sanitize } from './context.js'
import { TOOLS, runTool } from './tools.js'
import { validateActions } from './actions.js'
import { MODELS } from './qvac.js'
import { fail } from '../errors.js'

const MAX_TEXT = 500
const MAX_TOOL_ROUNDS = 3
const MODEL_TIMEOUT_MS = 90_000

export class Assistant {
  /**
   * @param {Object} opts
   * @param {() => Promise<object>} opts.getStatus
   * @param {(p: { amount: string }) => Promise<object>} opts.quoteBid
   * @param {{ get: (k: string) => Promise<any>, set: (k: string, v: any) => Promise<void> }} opts.settings
   * @param {() => import('./qvac.js').Engine} opts.engine - creates the model engine on first use
   * @param {() => void} [opts.onChange]
   */
  constructor ({ getStatus, quoteBid, settings, engine, onChange = () => {} }) {
    this.getStatus = getStatus
    this.quoteBid = quoteBid
    this.settings = settings
    this.makeEngine = engine
    this.onChange = onChange
    this.engine = null
    this.model = null // installed model key ('small' | 'better') or null
    this.state = 'none' // none | installed | downloading | loading | ready | error
    this.progress = null
    this.error = null
    this.turns = [] // short conversation memory for the model, never persisted
    this._busy = false
    this._loading = null
    this._lastEmit = 0
  }

  async ready () {
    const saved = await this.settings.get('assistant')
    if (saved?.model && MODELS[saved.model]) {
      this.model = saved.model
      this.state = 'installed' // downloaded before; loads on first question
    }
  }

  /** For status(): what the UI needs to show. */
  info (status) {
    return {
      state: this.state,
      model: this.model,
      progress: this.progress,
      error: this.error,
      models: Object.entries(MODELS).map(([key, m]) => ({ key, label: m.label, size: m.size, note: m.note })),
      suggestions: suggestions(status)
    }
  }

  /**
   * Downloads (once) and loads a model in the background. Progress arrives
   * through `onChange` → status().assistant.
   * @param {{ model: 'small'|'better' }} p
   */
  async install ({ model = 'small' } = {}) {
    if (!MODELS[model]) fail('BAD_INPUT', 'Unbekanntes Modell.')
    if (this.state === 'downloading' || this.state === 'loading') return this.info(await this.getStatus())
    this.model = model
    await this.settings.set('assistant', { model })
    this._load().catch(() => {})
    return { started: true }
  }

  /** @private */
  _load () {
    if (this._loading) return this._loading
    this.state = 'downloading'
    this.progress = 0
    this.error = null
    this.onChange()
    this._loading = (async () => {
      try {
        if (!this.engine) this.engine = this.makeEngine()
        await this.engine.load(this.model, (ratio) => {
          this.progress = ratio
          this.state = ratio >= 1 ? 'loading' : 'downloading'
          const now = Date.now()
          if (now - this._lastEmit > 500) { this._lastEmit = now; this.onChange() }
        })
        this.state = 'ready'
        this.progress = 1
      } catch (e) {
        this.state = 'error'
        this.error = 'Das Sprachmodell konnte nicht geladen werden: ' + (e?.message || e)
        throw e
      } finally {
        this._loading = null
        this.onChange()
      }
    })()
    return this._loading
  }

  /**
   * @param {{ text?: string, topic?: string }} p
   * @returns {Promise<{ reply: string, actions: object[], source: 'topic'|'rules'|'model'|'faq'|'none' }>}
   */
  async ask ({ text, topic } = {}) {
    if (this._busy) fail('BUSY', 'Einen Moment, ich denke noch über die letzte Frage nach.')
    this._busy = true
    try {
      const s = await this.getStatus()
      if (topic) {
        const a = answerTopic(topic, s)
        if (!a) fail('BAD_INPUT', 'Unbekanntes Thema.')
        return this._finish(s, a.text, a.actions, 'topic', null)
      }
      const question = sanitize(text, MAX_TEXT)
      if (!question) fail('BAD_INPUT', 'Bitte stell eine Frage.')

      const intent = matchIntent(question, s)
      if (intent) return this._finish(s, intent.text, intent.actions, 'rules', question)

      if (this.state !== 'none' && this.state !== 'error') return await this._askModel(s, question)

      const found = matchTopic(question)
      if (found) {
        const a = answerTopic(found, s)
        return this._finish(s, a.text, a.actions, 'faq', question)
      }
      return this._finish(s, 'Diese Frage kann ich ohne Sprachmodell noch nicht beantworten. Richte den Assistenten einmalig ein (läuft dann offline auf deinem Gerät) oder tippe auf einen Vorschlag.', [{ type: 'install' }], 'none', question)
    } finally {
      this._busy = false
    }
  }

  /** @private */
  async _askModel (s, question) {
    if (this.state !== 'ready') await this._load()
    const messages = [{ role: 'system', content: systemPrompt(s) }, ...this.turns.slice(-6), { role: 'user', content: question }]
    const actions = []
    let reply = ''
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const out = await withTimeout(this.engine.chat({ messages, tools: TOOLS }), MODEL_TIMEOUT_MS)
      const calls = (out.toolCalls || []).slice(0, 3)
      if (!calls.length) { reply = cleanReply(out.text); break }
      messages.push({ role: 'assistant', content: out.text || '', toolCalls: calls })
      for (const call of calls) {
        const r = await runTool(call, { status: s, quoteBid: this.quoteBid })
        if (r.action) actions.push(r.action)
        messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: JSON.stringify(r.result) })
      }
    }
    if (!reply) {
      reply = actions.length
        ? 'Ich habe das für dich vorbereitet. Bitte prüfe es und bestätige selbst.'
        : 'Das habe ich leider nicht verstanden. Magst du es anders formulieren?'
    }
    return this._finish(s, reply, actions, 'model', question)
  }

  /** @private */
  _finish (s, reply, actions, source, question) {
    const valid = validateActions(actions, s)
    if (question) {
      this.turns.push({ role: 'user', content: question }, { role: 'assistant', content: reply })
      this.turns = this.turns.slice(-12)
    }
    return { reply, actions: valid, source }
  }

  /** Forgets the conversation (also on lock). */
  reset () {
    this.turns = []
  }

  async close () {
    await this.engine?.close().catch(() => {})
  }
}

/** Strips reasoning blocks and stray markup; keeps answers short. */
export function cleanReply (text) {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?[a-z_]+>/gi, '')
    .trim()
    .slice(0, 1200)
}

function withTimeout (promise, ms) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Der Assistent hat zu lange gebraucht.')), ms) })
  ])
}
