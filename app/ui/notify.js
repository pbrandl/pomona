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
    out.push({ key: 'funds', title: 'Eingang auf deinem Konto', body: `+${amount(after - before)} ${next.wallet.symbol}` })
  }

  const a = prev.round
  const b = next.round
  if (!a || !b || a.address !== b.address) return out
  const organizer = b.role === 'organizer'
  const mine = Number(b.myPledge) > 0

  if (a.phase === 'bidding' && b.phase === 'running') {
    out.push({ key: 'reached', title: 'Ziel erreicht', body: `${b.title}: Die Ratenzahlung startet.` })
  }
  if (a.phase === 'bidding' && b.phase === 'failed') {
    out.push({
      key: 'failed',
      title: 'Ziel nicht erreicht',
      body: Number(b.refundable) > 0 ? 'Hol dir deinen Betrag in Pomona zurück.' : 'Die Bietenden bekommen ihr Geld zurück.'
    })
  }
  if (a.phase === 'running' && b.phase === 'completed' && Number(b.refundable) > 0) {
    out.push({ key: 'ended', title: 'Ratenzahlung beendet', body: `${amount(b.refundable)} ${b.symbol} warten auf dich.` })
  }
  if (b.mode === 'invoice' && b.invoiceCount > a.invoiceCount && mine) {
    out.push({ key: 'invoice-' + b.invoiceCount, title: `Rechnung ${b.invoiceCount} ist da`, body: `${amount(b.myPledge)} ${b.symbol} · Bitte in Pomona bezahlen.` })
  } else if (b.invoiceCount > a.invoiceCount && !organizer && mine) {
    out.push({ key: 'invoice-' + b.invoiceCount, title: `Rate ${b.invoiceCount} abgerechnet`, body: 'Dein Beleg ist da.' })
  }
  if (organizer && b.canInvoice && !a.canInvoice) {
    out.push({ key: 'due-' + b.invoiceCount, title: `Rechnung ${b.invoiceCount + 1} ist fällig`, body: 'Du kannst sie jetzt stellen.' })
  }
  if (organizer && b.bidders > a.bidders && own !== 'confirm-bid') {
    out.push({ key: 'bid-' + b.bidders, title: 'Neues Gebot', body: `${b.bidders} Bietende · ${Math.round(b.progress * 100)} % vom Ziel` })
  }
  if (b.phase === 'bidding' && a.biddingEnd - a.now >= 86400 && b.biddingEnd - b.now < 86400) {
    out.push({ key: 'soon', title: 'Bietphase endet bald', body: `${b.title}: noch weniger als 24 Stunden.` })
  }
  const newsA = a.news?.[0]?.at
  const newsB = b.news?.[0]
  if (!organizer && newsB && newsB.at !== newsA) {
    out.push({ key: 'news-' + newsB.at, title: `Neuigkeit: ${b.title}`, body: clip(newsB.text, 140) })
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
