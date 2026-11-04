/**
 * What the assistant knows without a language model: answers to the common
 * questions, written for people without crypto background and filled with the
 * live numbers of the round. Used for the suggestion buttons, as a fallback
 * when no model is installed, and as background knowledge for the model.
 *
 * Pure functions on the status() snapshot; runs in Bare, Node and the browser.
 *
 * @module core/agent/knowledge
 */
import { num, day, until, per } from './words.js'
import { t, raw } from '../../i18n/index.js'

/**
 * @typedef {Object} Answer
 * @property {string} text
 * @property {Array<object>} [actions] - proposals, validated later
 */

const pledged = (r) => Number(r?.myPledge) > 0

/** Round paid invoice by invoice (no escrow), see core/schedule.js MODES. */
const payg = (r) => r?.mode === 'invoice'

/** Text of this topic in the current language (i18n/<lang>/agent.js, topic.*). */
const say = (id, key, params) => t(`agent.topic.${id}.${key}`, params)

/** @type {Record<string, { answer: (s: object) => Answer }>} question and keywords: catalog */
export const TOPICS = {
  how: {
    answer: (s) => {
      const r = s.round
      if (!r) return { text: say('how', 'none') }
      const p = per(r.intervalName)
      const plan = ' ' + say('how', 'plan', { n: r.installments, adj: p.adj, day: day(r.biddingEnd) })
      return { text: say('how', payg(r) ? 'invoice' : 'deposit') + plan }
    }
  },
  failed: {
    answer: (s) => {
      const r = s.round
      const refund = r && Number(r.refundable) > 0
      if (payg(r)) return { text: say('failed', 'invoice') }
      return {
        text: say('failed', 'deposit') + (refund ? ' ' + say('failed', 'ready', { amount: num(r.refundable), symbol: r.symbol }) : ''),
        actions: refund ? [{ type: 'refund' }] : []
      }
    }
  },
  howmuch: {
    answer: (s) => {
      const r = s.round
      if (!r) return { text: say('howmuch', 'none') }
      const p = per(r.intervalName)
      const missing = Math.max(0, Number(r.target) - Number(r.total))
      const v = { symbol: r.symbol, per: p.per }
      const text = [say('howmuch', 'target', { ...v, target: num(r.target), total: num(r.total), pct: Math.round(r.progress * 100) })]
      if (r.guide) text.push(say('howmuch', 'guide', { ...v, guide: num(r.guide) }))
      else if (missing > 0) text.push(say('howmuch', 'missing', { ...v, missing: num(missing) }))
      if (Number(r.minBid) > 0) text.push(say('howmuch', 'min', { ...v, min: num(r.minBid) }))
      text.push(say('howmuch', payg(r) ? 'invoice' : 'deposit', { n: r.installments }))
      return { text: text.join(' '), actions: r.phase === 'bidding' && r.guide ? [{ type: 'bid', amount: r.guide }] : [] }
    }
  },
  change: {
    answer: (s) => {
      const r = s.round
      if (!r || r.phase !== 'bidding') return { text: say('change', 'fixed') }
      const text = say('change', 'yes', { day: day(r.biddingEnd), left: until(r.biddingEnd, r.now) }) + (payg(r) ? '' : ' ' + say('change', 'back'))
      return { text, actions: pledged(r) ? [{ type: 'withdraw' }] : [] }
    }
  },
  next: {
    answer: (s) => {
      const r = s.round
      if (!r) return { text: say('next', 'none') }
      const p = per(r.intervalName)
      const at = { i: r.invoiceCount + 1, n: r.installments }
      if (r.phase === 'bidding') return { text: say('next', 'bidding', { day: day(r.biddingEnd), adj: p.adj, n: r.installments }) }
      if (r.phase === 'running' && payg(r)) {
        if (r.openInvoices > 0) { // own open invoices, also an organizer who bid
          return { text: say('next', 'open', { n: r.openInvoices, amount: num(r.openAmount), symbol: r.symbol }), actions: [{ type: 'pay' }] }
        }
        const next = r.invoiceCount < r.installments ? say('next', 'nextInvoice', { ...at, day: day(r.nextInvoiceAt) }) : say('next', 'allSent')
        return { text: next + ' ' + say('next', r.role === 'organizer' ? 'paidToYou' : 'youPay') }
      }
      if (r.phase === 'running') {
        const text = r.canInvoice
          ? say('next', 'dueNow', at) + ' ' + say('next', r.role === 'organizer' ? 'youInvoice' : 'organizerInvoices')
          : say('next', 'dueFrom', { ...at, day: day(r.nextInvoiceAt) })
        return { text, actions: r.role === 'organizer' && r.canInvoice ? [{ type: 'invoice' }] : [] }
      }
      if (r.phase === 'completed') return { text: say('next', 'completed', { done: r.invoiceCount, n: r.installments }) }
      return { text: say('next', 'failed') }
    }
  },
  receipt: {
    answer: (s) => {
      const r = s.round
      const paid = (r?.myInvoices || []).filter((x) => x.status === 'paid')
      const count = paid.length ? ' ' + say('receipt', 'count', { n: paid.length }) : ''
      const actions = paid.length ? [{ type: 'receipt', index: paid.at(-1).index }] : []
      if (payg(r)) return { text: say('receipt', 'invoice') + count, actions }
      return { text: say('receipt', 'deposit') + (count || ' ' + say('receipt', 'noneYet')), actions }
    }
  },
  fees: {
    answer: () => ({ text: say('fees', 'text') })
  },
  safety: {
    answer: (s) => ({ text: say('safety', !s.round ? 'none' : payg(s.round) ? 'invoice' : 'deposit') + ' ' + say('safety', 'honest') })
  },
  pay: {
    answer: (s) => {
      const r = s.round
      if (!payg(r)) return { text: say('pay', 'deposit') }
      if (r.openInvoices > 0) return { text: say('pay', 'open', { amount: num(r.openAmount), symbol: r.symbol }), actions: [{ type: 'pay' }] }
      return { text: say('pay', 'none') }
    }
  },
  fund: {
    answer: (s) => ({
      text: say('fund', 'text', { network: s.network?.name ?? say('fund', 'rightNetwork') }),
      actions: [{ type: 'open', page: 'fund' }]
    })
  },
  refund: {
    answer: (s) => {
      const r = s.round
      const amount = Number(r?.refundable)
      if (amount > 0) return { text: say('refund', 'ready', { amount: num(amount), symbol: r.symbol }), actions: [{ type: 'refund' }] }
      if (r?.phase === 'bidding' && pledged(r)) return { text: say('refund', 'withdraw', { amount: num(r.myDeposit), symbol: r.symbol }), actions: [{ type: 'withdraw' }] }
      return { text: say('refund', 'none') }
    }
  },
  words: {
    answer: () => ({ text: say('words', 'text'), actions: [{ type: 'open', page: 'wallet' }] })
  },
  status: {
    answer: (s) => {
      const r = s.round
      if (!r) return { text: say('status', 'none') }
      const p = per(r.intervalName)
      const phase = r.phase === 'bidding'
        ? say('status', 'bidding', { left: until(r.biddingEnd, r.now) })
        : r.phase === 'running' ? say('status', 'running', { done: r.invoiceCount, n: r.installments }) : say('status', r.phase)
      let text = say('status', 'summary', { n: r.bidders, total: num(r.total), target: num(r.target), symbol: r.symbol, per: p.per, pct: Math.round(r.progress * 100), phase })
      if (pledged(r)) text += ' ' + say('status', 'mine', { amount: num(r.myPledge), symbol: r.symbol, per: p.per })
      return { text, actions: r.role === 'organizer' && r.canInvoice ? [{ type: 'invoice' }] : [] }
    }
  },
  invoice: {
    answer: (s) => {
      const r = s.round
      if (payg(r)) {
        if (r.role !== 'organizer') return TOPICS.pay.answer(s)
        return { text: say('invoice', 'auto') }
      }
      if (r?.role !== 'organizer') return { text: say('invoice', 'notOrganizer') }
      if (r.canInvoice) return { text: say('invoice', 'due', { i: r.invoiceCount + 1, amount: num(r.total), symbol: r.symbol }), actions: [{ type: 'invoice' }] }
      if (r.phase === 'running') return { text: say('invoice', 'later', { day: day(r.nextInvoiceAt) }) }
      return { text: say('invoice', 'none') }
    }
  }
}

/** Topics that make sense for this person right now (for the suggestion buttons). */
export function suggestions (s) {
  const r = s?.round
  let ids
  if (!r) ids = ['how', 'fund', 'safety', 'fees']
  else if (r.role === 'organizer') ids = r.phase === 'running' ? ['status', 'invoice', 'next', 'safety'] : ['status', 'howmuch', 'failed', 'fees']
  else if (r.phase === 'bidding') ids = [pledged(r) ? 'change' : 'howmuch', 'how', 'failed', 'fees']
  else if (Number(r.refundable) > 0) ids = ['refund', 'status', 'receipt']
  else if (r.openInvoices > 0) ids = ['pay', 'receipt', 'status', 'safety']
  else ids = ['next', 'receipt', 'status', 'safety']
  return ids.map((topic) => ({ topic, question: say(topic, 'question') }))
}

/** @returns {Answer|null} */
export function answerTopic (topic, s) {
  return Object.hasOwn(TOPICS, topic) ? TOPICS[topic].answer(s) : null
}

/**
 * Finds the best matching topic for a free-text question by keywords, or null.
 * @param {string} text
 */
export function matchTopic (text) {
  const t = ' ' + String(text).toLowerCase() + ' '
  let best = null
  let score = 0
  for (const id of Object.keys(TOPICS)) {
    const hits = raw(`agent.topic.${id}.keywords`).reduce((n, k) => n + (t.includes(k) ? k.length : 0), 0)
    if (hits > score) { best = id; score = hits }
  }
  return score >= 4 ? best : null
}

/** Background knowledge for the language model (compact, factual). */
export const facts = () => raw('agent.facts')
