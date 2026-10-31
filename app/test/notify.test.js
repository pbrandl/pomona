// Which status changes produce a notification (ui/notify.js is pure).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changes } from '../ui/notify.js'

const wallet = (usdt) => ({ state: 'unlocked', usdt, symbol: 'USDT' })
const round = (over = {}) => ({
  address: '0x1',
  title: 'Solawi',
  role: 'bidder',
  symbol: 'USDT',
  phase: 'bidding',
  progress: 0.5,
  bidders: 3,
  invoiceCount: 0,
  canInvoice: false,
  refundable: '0',
  biddingEnd: 100 * 86400,
  now: 0,
  invoices: [{ mine: true }],
  news: [],
  ...over
})
const st = (r, usdt = '100', busy = null) => ({ wallet: wallet(usdt), round: r, busy })
const keys = (list) => list.map((n) => n.key)

test('deposit is announced, but not money from own refunds', () => {
  assert.deepEqual(keys(changes(st(null, '0'), st(null, '1200'))), ['funds'])
  assert.deepEqual(keys(changes(st(null, '0'), st(null, '1200'), { own: 'refund' })), [])
  assert.deepEqual(keys(changes(null, st(null, '1200'))), []) // first load: nothing
})

test('phase changes, invoices and news reach bidders', () => {
  assert.deepEqual(keys(changes(st(round()), st(round({ phase: 'running' })))), ['reached'])
  assert.deepEqual(keys(changes(st(round()), st(round({ phase: 'failed', refundable: '1200' })))), ['failed'])
  const running = round({ phase: 'running', invoiceCount: 2 })
  assert.deepEqual(keys(changes(st(running), st({ ...running, invoiceCount: 3 }))), ['invoice-3'])
  assert.deepEqual(keys(changes(st(round()), st(round({ news: [{ text: 'Hoffest!', at: 5 }] })))), ['news-5'])
  assert.deepEqual(keys(changes(st(round({ now: 0 })), st(round({ now: 99.5 * 86400 })))), ['soon'])
})

test('organizers hear about new bids and due invoices, not about their own actions', () => {
  const org = round({ role: 'organizer', invoices: [{ mine: false }] })
  assert.deepEqual(keys(changes(st(org), st({ ...org, bidders: 4 }))), ['bid-4'])
  assert.deepEqual(keys(changes(st(org), st({ ...org, bidders: 4 }), { own: 'confirm-bid' })), [])
  const run = { ...org, phase: 'running', invoiceCount: 1 }
  assert.deepEqual(keys(changes(st(run), st({ ...run, canInvoice: true }))), ['due-1'])
  assert.deepEqual(keys(changes(st(run), st({ ...run, invoiceCount: 2 }))), []) // own invoice
  assert.deepEqual(keys(changes(st(org), st({ ...org, news: [{ text: 'x', at: 9 }] }))), []) // own news
})
