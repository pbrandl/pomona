/**
 * Clear commands the assistant understands without a language model:
 * "Ich möchte 100 im Monat bieten", "Konto aufladen", "Zeig meinen Beleg für
 * Rate 2", "Rechnung stellen" (patterns per language in i18n/). Fast, predictable, offline, and the same in
 * every runtime. Anything less clear goes to the model (or the FAQ).
 *
 * @module core/agent/intents
 */
import { num, per, normalizeAmount } from './words.js'
import { t, raw } from '../../i18n/index.js'

const AMOUNT = /(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,6}))?\s*(usdt|usd|dollar|dólar|dolar|\$|euros?|eur|€)?/i

/** Extracts the first amount and its currency word from free text. */
export function findAmount (text) {
  const m = AMOUNT.exec(text)
  if (!m) return null
  const raw = m[2] ? `${m[1].replace(/\./g, '')}.${m[2]}` : m[1]
  const amount = normalizeAmount(raw)
  if (!amount) return null
  return { amount, currency: (m[3] || '').toLowerCase() }
}

/** The command pattern `name` of the current language (i18n/<lang>/agent.js, match.*). */
const pattern = (name) => new RegExp(raw('agent.match.' + name))
const say = (key, params) => t('agent.intent.' + key, params)

/**
 * @param {string} text
 * @param {object} s - status() snapshot
 * @returns {{ text: string, actions: object[] }|null}
 */
export function matchIntent (text, s) {
  const t = String(text).toLowerCase()
  const r = s?.round

  // "Ich möchte 100 im Monat bieten", "Gebot 80", "erhöhe um 20"
  if (pattern('bid').test(t)) {
    const found = findAmount(t)
    if (found && r?.phase === 'bidding') {
      const p = per(r.intervalName)
      const v = { amount: num(found.amount), symbol: r.symbol, per: p.per, n: r.installments }
      const raise = Number(r.myPledge) > 0
      const money = r.mode === 'invoice' ? say('bidInvoice', v) : say('bidDeposit', { ...v, total: num(Number(found.amount) * r.installments) })
      let reply = [say(raise ? 'bidRaise' : 'bidNew', v), money, say('bidConfirm')].join(' ')
      if (pattern('euro').test(found.currency)) reply = say('euro') + ' ' + reply
      return { text: reply, actions: [{ type: 'bid', amount: found.amount }] }
    }
    if (found && r) return { text: say('notBidding'), actions: [] }
  }

  if (pattern('fund').test(t)) {
    return { text: say('fund'), actions: [{ type: 'open', page: 'fund' }] }
  }

  if (pattern('receipt').test(t) && !pattern('check').test(t)) {
    const paid = (r?.myInvoices || []).filter((x) => x.status === 'paid')
    if (!paid.length) return { text: say('noReceipt'), actions: [] }
    const n = pattern('installment').exec(t)
    const pick = n ? paid.find((x) => x.index === Number(n[1]) - 1) : paid.at(-1)
    if (!pick) return { text: say('noReceiptFor', { i: n[1], n: paid.length }), actions: [] }
    return { text: say('receipt', { i: pick.index + 1 }), actions: [{ type: 'receipt', index: pick.index }] }
  }

  if (pattern('scan').test(t)) {
    if (r?.role === 'organizer') return { text: say('scan'), actions: [{ type: 'open', page: 'scan' }] }
    return null
  }

  if (pattern('invoice').test(t) && r?.role === 'organizer') {
    if (r.canInvoice) return { text: say('invoice', { n: r.invoiceCount + 1, amount: num(r.total), symbol: r.symbol }), actions: [{ type: 'invoice' }] }
    return { text: say('noInvoiceDue'), actions: [] }
  }

  if (pattern('pay').test(t) && r?.mode === 'invoice') {
    if (r.openInvoices > 0) return { text: say('pay', { amount: num(r.openAmount), symbol: r.symbol }), actions: [{ type: 'pay' }] }
    return { text: say('noOpenInvoice'), actions: [] }
  }

  if (pattern('withdraw').test(t)) {
    if (r?.phase === 'bidding' && Number(r.myPledge) > 0) {
      const back = Number(r.myDeposit) > 0 ? ' ' + say('withdrawBack', { amount: num(r.myDeposit), symbol: r.symbol }) : ''
      return { text: say('withdraw') + back, actions: [{ type: 'withdraw' }] }
    }
    return null
  }

  if (pattern('refund').test(t) && Number(r?.refundable) > 0) {
    return { text: say('refund', { amount: num(r.refundable), symbol: r.symbol }), actions: [{ type: 'refund' }] }
  }

  return null
}
