/**
 * The assistant's tools. None of them moves money or changes state: they read
 * (calculate_bid) or propose an action that the person confirms in the app.
 * Proposals are validated against the status (actions.js) before the UI sees
 * them.
 *
 * Format: QVAC `Tool` objects ({ type: 'function', name, description, parameters });
 * descriptions are getters, so they follow the current language.
 *
 * @module core/agent/tools
 */
import { validateAction } from './actions.js'
import { normalizeAmount } from './words.js'
import { t } from '../../i18n/index.js'

export const TOOLS = [
  {
    type: 'function',
    name: 'calculate_bid',
    get description () { return t('agent.tool.calculate_bid') },
    parameters: { type: 'object', properties: { amount: { type: 'string', get description () { return t('agent.tool.amountExample') } } }, required: ['amount'] }
  },
  {
    type: 'function',
    name: 'prepare_bid',
    get description () { return t('agent.tool.prepare_bid') },
    parameters: { type: 'object', properties: { amount: { type: 'string', get description () { return t('agent.tool.amount') } } }, required: ['amount'] }
  },
  {
    type: 'function',
    name: 'open_page',
    get description () { return t('agent.tool.open_page') },
    parameters: { type: 'object', properties: { page: { type: 'string', enum: ['fund', 'wallet', 'scan', 'join', 'create'], get description () { return t('agent.tool.pages') } } }, required: ['page'] }
  },
  {
    type: 'function',
    name: 'show_receipt',
    get description () { return t('agent.tool.show_receipt') },
    parameters: { type: 'object', properties: { installment: { type: 'integer', get description () { return t('agent.tool.installment') } } }, required: ['installment'] }
  },
  {
    type: 'function',
    name: 'prepare_invoice',
    get description () { return t('agent.tool.prepare_invoice') },
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'show_open_invoices',
    get description () { return t('agent.tool.show_open_invoices') },
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'prepare_withdraw',
    get description () { return t('agent.tool.prepare_withdraw') },
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'prepare_refund',
    get description () { return t('agent.tool.prepare_refund') },
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'draft_news',
    get description () { return t('agent.tool.draft_news') },
    parameters: { type: 'object', properties: { text: { type: 'string', get description () { return t('agent.tool.newsText') } } }, required: ['text'] }
  }
]

const TO_ACTION = {
  prepare_bid: (a) => ({ type: 'bid', amount: a.amount }),
  open_page: (a) => ({ type: 'open', page: a.page }),
  show_receipt: (a) => ({ type: 'receipt', index: Number(a.installment) - 1 }),
  prepare_invoice: () => ({ type: 'invoice' }),
  show_open_invoices: () => ({ type: 'pay' }),
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
    if (!amount) return { result: { ok: false, error: t('agent.tool.badAmount') } }
    try {
      const q = await ctx.quoteBid({ amount })
      return { result: { ok: true, perInstallment: q.amount, installments: q.installments, deposit: q.deposit, fee: q.fee, balance: q.balance, enough: q.enough, missing: q.missing, symbol: q.symbol } }
    } catch (e) {
      return { result: { ok: false, error: e.message } }
    }
  }
  const make = Object.hasOwn(TO_ACTION, call?.name) ? TO_ACTION[call.name] : null
  if (!make) return { result: { ok: false, error: t('agent.tool.unknown') } }
  if (call.name === 'prepare_bid') {
    // Check the rules (phase, minimum, invite) before proposing.
    const amount = normalizeAmount(args.amount)
    if (!amount) return { result: { ok: false, error: t('agent.tool.badAmount') } }
    try {
      await ctx.quoteBid({ amount })
    } catch (e) {
      return { result: { ok: false, error: e.message } }
    }
  }
  const action = validateAction(make(args), ctx.status)
  if (!action) return { result: { ok: false, error: t('agent.tool.notFitting') } }
  return { result: { ok: true, prepared: action.label, note: t('agent.tool.prepared') }, action }
}
