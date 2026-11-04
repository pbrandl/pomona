/**
 * Notifications: what changed between two status snapshots that the user
 * should know about, even when the window is in the background.
 *
 * `changes()` is pure (unit-tested in test/notify.test.js). `deliver()` shows
 * an in-app toast when the window has focus, otherwise an OS notification.
 *
 * @module ui/notify
 */
import { fmt as amount } from './format.js'
import { t } from '../i18n/index.js'

const say = (key, params) => t('notify.' + key, params)

/** Actions whose own effect must not trigger a notification. */
const MONEY_IN = new Set(['refund', 'withdraw', 'invoice', 'faucet'])

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/**
 * @param {object|null} prev - previous status()
 * @param {object|null} next - new status()
 * @param {{ own?: string|null }} [ctx] - the action the user is running right now
 * @returns {Array<{ key: string, title: string, body: string }>}
 */
export function changes (prev, next, { own = null } = {}) {
  const out = []
  if (!prev || !next) return out

  // Money arrived in the wallet (not caused by our own refund, invoice, …).
  const before = Number(prev.wallet?.usdt ?? NaN)
  const after = Number(next.wallet?.usdt ?? NaN)
  if (after > before && !MONEY_IN.has(own) && !next.busy) {
    out.push({ key: 'funds', title: say('funds'), body: `+${amount(after - before)} ${next.wallet.symbol}` })
  }

  const a = prev.round
  const b = next.round
  if (!a || !b || a.address !== b.address) return out
  const organizer = b.role === 'organizer'
  const mine = Number(b.myPledge) > 0

  if (a.phase === 'bidding' && b.phase === 'running') {
    out.push({ key: 'reached', title: say('reached'), body: say('reachedBody', { title: b.title }) })
  }
  if (a.phase === 'bidding' && b.phase === 'failed') {
    out.push({
      key: 'failed',
      title: say('failed'),
      body: say(Number(b.refundable) > 0 ? 'failedRefund' : 'failedOthers')
    })
  }
  if (a.phase === 'running' && b.phase === 'completed' && Number(b.refundable) > 0) {
    out.push({ key: 'ended', title: say('ended'), body: say('endedBody', { amount: amount(b.refundable), symbol: b.symbol }) })
  }
  if (b.mode === 'invoice' && b.invoiceCount > a.invoiceCount && mine) {
    out.push({ key: 'invoice-' + b.invoiceCount, title: say('invoice', { i: b.invoiceCount }), body: say('invoiceBody', { amount: amount(b.myPledge), symbol: b.symbol }) })
  } else if (b.invoiceCount > a.invoiceCount && !organizer && mine) {
    out.push({ key: 'invoice-' + b.invoiceCount, title: say('billed', { i: b.invoiceCount }), body: say('billedBody') })
  }
  if (organizer && b.canInvoice && !a.canInvoice) {
    out.push({ key: 'due-' + b.invoiceCount, title: say('due', { i: b.invoiceCount + 1 }), body: say('dueBody') })
  }
  if (organizer && b.bidders > a.bidders && own !== 'confirm-bid') {
    out.push({ key: 'bid-' + b.bidders, title: say('bid'), body: say('bidBody', { n: b.bidders, pct: Math.round(b.progress * 100) }) })
  }
  if (b.phase === 'bidding' && a.biddingEnd - a.now >= 86400 && b.biddingEnd - b.now < 86400) {
    out.push({ key: 'soon', title: say('soon'), body: say('soonBody', { title: b.title }) })
  }
  const newsA = a.news?.[0]?.at
  const newsB = b.news?.[0]
  if (!organizer && newsB && newsB.at !== newsA) {
    out.push({ key: 'news-' + newsB.at, title: say('news', { title: b.title }), body: clip(newsB.text, 140) })
  }
  return out
}

/**
 * @param {Array<{ key: string, title: string, body: string }>} list
 * @param {(text: string) => void} toast - in-app fallback
 */
export function deliver (list, toast) {
  if (!list.length) return
  const focused = typeof document !== 'undefined' && document.hasFocus()
  const N = typeof window !== 'undefined' ? window.Notification : undefined
  if (focused || !N) {
    toast(list.map((n) => `${n.title}: ${n.body}`).join(' · '))
    return
  }
  const show = () => { for (const n of list) new N(n.title, { body: n.body, tag: n.key, silent: false }) } // eslint-disable-line no-new
  if (N.permission === 'granted') show()
  else if (N.permission !== 'denied') N.requestPermission().then((p) => (p === 'granted' ? show() : toast(list[0].title)))
  else toast(list[0].title)
}
