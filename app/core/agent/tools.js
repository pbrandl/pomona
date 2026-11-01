/**
 * The assistant's tools. None of them moves money or changes state: they read
 * (calculate_bid) or propose an action that the person confirms in the app.
 * Proposals are validated against the status (actions.js) before the UI sees
 * them.
 *
 * Format: QVAC `Tool` objects ({ type: 'function', name, description, parameters }).
 *
 * @module core/agent/tools
 */
import { validateAction } from './actions.js'
import { normalizeAmount } from './words.js'

export const TOOLS = [
  {
    type: 'function',
    name: 'calculate_bid',
    description: 'Berechnet, was ein Gebot bedeuten würde: hinterlegter Gesamtbetrag, Netzwerkgebühr, ob das Guthaben reicht. Führt nichts aus.',
    parameters: { type: 'object', properties: { amount: { type: 'string', description: 'Betrag pro Rate in USDT, z. B. "100"' } }, required: ['amount'] }
  },
  {
    type: 'function',
    name: 'prepare_bid',
    description: 'Bereitet ein Gebot (oder eine Erhöhung um diesen Betrag) vor. Öffnet die Prüfseite; die Person bestätigt selbst.',
    parameters: { type: 'object', properties: { amount: { type: 'string', description: 'Betrag pro Rate in USDT' } }, required: ['amount'] }
  },
  {
    type: 'function',
    name: 'open_page',
    description: 'Öffnet eine Seite der App.',
    parameters: { type: 'object', properties: { page: { type: 'string', enum: ['fund', 'wallet', 'scan', 'join', 'create'], description: 'fund = Konto aufladen, wallet = Konto, scan = Beleg prüfen (Organisator), join = Runde beitreten, create = Runde starten' } }, required: ['page'] }
  },
  {
    type: 'function',
    name: 'show_receipt',
    description: 'Zeigt den Beleg (QR-Code) für eine bezahlte Rate der Person.',
    parameters: { type: 'object', properties: { installment: { type: 'integer', description: 'Nummer der Rate, beginnend bei 1' } }, required: ['installment'] }
  },
  {
    type: 'function',
    name: 'prepare_invoice',
    description: 'Nur Organisator: bereitet die fällige Rechnung vor. Die Person bestätigt selbst.',
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'prepare_withdraw',
    description: 'Bereitet das Zurückziehen des eigenen Gebots vor (nur in der Bietphase). Die Person bestätigt selbst.',
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'prepare_refund',
    description: 'Bereitet das Zurückholen von Geld aus dem Contract vor, wenn etwas zurückzuholen ist.',
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'draft_news',
    description: 'Nur Organisator: entwirft eine Neuigkeit an alle Bietenden. Wird nicht gesendet, nur vorausgefüllt.',
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'Text der Neuigkeit, kurz und freundlich' } }, required: ['text'] }
  }
]

const TO_ACTION = {
  prepare_bid: (a) => ({ type: 'bid', amount: a.amount }),
  open_page: (a) => ({ type: 'open', page: a.page }),
  show_receipt: (a) => ({ type: 'receipt', index: Number(a.installment) - 1 }),
  prepare_invoice: () => ({ type: 'invoice' }),
  prepare_withdraw: () => ({ type: 'withdraw' }),
  prepare_refund: () => ({ type: 'refund' }),
  draft_news: (a) => ({ type: 'news', text: a.text })
}

/**
 * Runs one tool call.
 * @param {{ name: string, arguments: object }} call
 * @param {{ status: object, quoteBid: (p: { amount: string }) => Promise<object> }} ctx
 * @returns {Promise<{ result: object, action?: object }>} `result` goes back to the model
 */
export async function runTool (call, ctx) {
  const args = call?.arguments && typeof call.arguments === 'object' ? call.arguments : {}
  if (call?.name === 'calculate_bid') {
    const amount = normalizeAmount(args.amount)
    if (!amount) return { result: { ok: false, error: 'Ungültiger Betrag.' } }
    try {
      const q = await ctx.quoteBid({ amount })
      return { result: { ok: true, perInstallment: q.amount, installments: q.installments, deposit: q.deposit, fee: q.fee, balance: q.balance, enough: q.enough, missing: q.missing, symbol: q.symbol } }
    } catch (e) {
      return { result: { ok: false, error: e.message } }
    }
  }
  const make = Object.hasOwn(TO_ACTION, call?.name) ? TO_ACTION[call.name] : null
  if (!make) return { result: { ok: false, error: 'Dieses Werkzeug gibt es nicht.' } }
  if (call.name === 'prepare_bid') {
    // Check the rules (phase, minimum, invite) before proposing.
    const amount = normalizeAmount(args.amount)
    if (!amount) return { result: { ok: false, error: 'Ungültiger Betrag.' } }
    try {
      await ctx.quoteBid({ amount })
    } catch (e) {
      return { result: { ok: false, error: e.message } }
    }
  }
  const action = validateAction(make(args), ctx.status)
  if (!action) return { result: { ok: false, error: 'Das passt gerade nicht zur Runde oder zur Rolle der Person.' } }
  return { result: { ok: true, prepared: action.label, note: 'Vorbereitet. Die Person bestätigt selbst in der App.' }, action }
}
