/**
 * What the assistant may propose. An action never moves money: it opens an
 * existing page of the app, pre-filled, and the person confirms there.
 *
 *   { type: 'bid', amount }        → bid flow, "Prüfen" page with the amount
 *   { type: 'open', page }         → fund | wallet | scan | join | create
 *   { type: 'receipt', index }     → receipt of a paid installment (0-based)
 *   { type: 'invoice' }            → organizer: invoice page/confirmation
 *   { type: 'withdraw' }           → withdraw confirmation
 *   { type: 'refund' }             → refund button
 *   { type: 'news', text }         → organizer: news field pre-filled, not sent
 *   { type: 'install' }            → set up the assistant's language model
 *
 * `validateAction` checks every proposal against the current status, so a
 * confused or manipulated model cannot propose something that does not fit.
 *
 * @module core/agent/actions
 */
import { num, normalizeAmount, per } from './words.js'

const PAGES = { fund: 'Konto aufladen', wallet: 'Konto öffnen', scan: 'Beleg prüfen', join: 'Runde beitreten', create: 'Runde starten' }

/**
 * @param {object} a - proposed action
 * @param {object} s - status() snapshot
 * @returns {{ type: string, label: string, [k: string]: unknown }|null} normalized action or null
 */
export function validateAction (a, s) {
  if (!a || typeof a !== 'object') return null
  const r = s?.round
  const organizer = r?.role === 'organizer'
  switch (a.type) {
    case 'bid': {
      if (!r || r.phase !== 'bidding') return null
      const amount = normalizeAmount(a.amount)
      if (!amount) return null
      const p = per(r.intervalName)
      return { type: 'bid', amount, label: `Gebot prüfen: ${num(amount)} ${r.symbol} ${p.per}` }
    }
    case 'open': {
      if (!Object.hasOwn(PAGES, a.page)) return null
      if ((a.page === 'join' || a.page === 'create') && r) return null
      if (a.page === 'scan' && !organizer) return null
      return { type: 'open', page: a.page, label: PAGES[a.page] }
    }
    case 'receipt': {
      const index = Number(a.index)
      const inv = r?.invoices?.[index]
      if (!Number.isInteger(index) || !inv || inv.status !== 'paid' || !inv.mine) return null
      return { type: 'receipt', index, label: `Beleg für Rate ${index + 1} zeigen` }
    }
    case 'invoice':
      if (!organizer || !r.canInvoice) return null
      return { type: 'invoice', label: `Rechnung ${r.invoiceCount + 1} stellen` }
    case 'withdraw':
      if (!r || r.phase !== 'bidding' || !(Number(r.myPledge) > 0)) return null
      return { type: 'withdraw', label: 'Gebot zurückziehen' }
    case 'refund':
      if (!r || !(Number(r.refundable) > 0)) return null
      return { type: 'refund', label: `${num(r.refundable)} ${r.symbol} zurückholen` }
    case 'news': {
      const text = String(a.text ?? '').trim().slice(0, 1000)
      if (!organizer || !text) return null
      return { type: 'news', text, label: 'Neuigkeit ansehen und senden' }
    }
    case 'install':
      return { type: 'install', label: 'Assistent einrichten' }
    default:
      return null
  }
}

/** Validates a list, drops invalid and duplicate proposals. */
export function validateActions (list, s) {
  const out = []
  const seen = new Set()
  for (const a of list || []) {
    const v = validateAction(a, s)
    if (!v) continue
    const key = JSON.stringify(v)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out.slice(0, 3)
}
