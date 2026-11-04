/**
 * What the language model sees about the current situation.
 *
 * Facts from the contract and the wallet are listed plainly. Texts written by
 * other peers (title and news of the round) are untrusted: they are
 * cleaned, shortened and fenced as data, and the system prompt tells the model
 * never to follow instructions found inside. Even if a model did, it has no
 * tool that moves money (see tools.js and actions.js).
 *
 * @module core/agent/context
 */
import { num, day, until, per } from './words.js'
import { facts } from './knowledge.js'
import { t, raw } from '../../i18n/index.js'

/** Removes anything that could pose as prompt structure; clips the length. */
export function sanitize (text, max = 400) {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ') // eslint-disable-line no-control-regex
    .replace(/<\|[^|]*\|>/g, ' ') // chat-template tokens like <|im_start|>
    .replace(/<\/?(think|tool_call|tool_response|system|user|assistant)[^>]*>/gi, ' ')
    .replace(/\[\/?(INST|SYS)\]/gi, ' ')
    .replace(/<<<|>>>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

const say = (key, params) => t('agent.ctx.' + key, params)

/** @param {object} s - status() snapshot @returns {string} */
export function describe (s) {
  const lines = []
  const w = s.wallet
  lines.push(say('network', { name: s.network?.name ?? say('unknown') }))
  if (w?.state === 'unlocked') lines.push(say('balance', { amount: num(w.usdt), symbol: w.symbol }))
  const r = s.round
  if (!r) {
    lines.push(say('noRound'))
    return lines.join('\n')
  }
  const p = per(r.intervalName)
  const v = { symbol: r.symbol, per: p.per }
  lines.push(say('role', { role: say(r.role === 'organizer' ? 'organizer' : 'bidder') }))
  lines.push(say('phase', { phase: say('phases.' + r.phase) }))
  lines.push(say('biddingEnd', { day: day(r.biddingEnd), left: until(r.biddingEnd, r.now) }))
  lines.push(say('target', { ...v, target: num(r.target), total: num(r.total), pct: Math.round(r.progress * 100), bidders: r.bidders }))
  const next = r.phase === 'running' ? say('nextInvoice', { day: day(r.nextInvoiceAt) }) + (r.canInvoice ? say('dueNow') : '') : ''
  lines.push(say('installments', { n: r.installments, adj: p.adj, done: r.invoiceCount }) + next)
  if (Number(r.minBid) > 0) lines.push(say('minBid', { ...v, amount: num(r.minBid) }))
  if (r.guide) lines.push(say('guide', { ...v, amount: num(r.guide) }))
  lines.push(say('pledge', { pledge: Number(r.myPledge) > 0 ? say('pledgeValue', { ...v, amount: num(r.myPledge), deposit: num(r.myDeposit) }) : say('none') }))
  if (Number(r.refundable) > 0) lines.push(say('refundable', { amount: num(r.refundable), symbol: r.symbol }))
  const paid = (r.myInvoices || []).filter((x) => x.status === 'paid').map((x) => x.index + 1)
  if (paid.length) lines.push(say('receipts', { list: paid.join(', ') }))

  const peer = [say('title', { text: sanitize(r.title, 120) })]
  for (const n of (r.news || []).slice(0, 3)) peer.push(say('news', { text: sanitize(n.text, 300) }))
  lines.push('')
  lines.push(say('peer'))
  lines.push('<<<DATEN')
  lines.push(...peer)
  lines.push('DATEN>>>')
  return lines.join('\n')
}

/** The full system prompt for one turn, in the current language. */
export function systemPrompt (s) {
  return [
    ...raw('agent.prompt'),
    '',
    t('agent.promptFacts'),
    ...facts().map((f) => '- ' + f),
    '',
    t('agent.promptNow'),
    describe(s),
    '/no_think'
  ].join('\n')
}
