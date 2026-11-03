/**
 * The complete API the UI may call. Nothing else of the Pomona object is
 * reachable from the renderer. Documented in docs/RPC.md.
 * @module core/rpc/methods
 */
import { LIMITS } from '../config/limits.js'

/** @typedef {'string'|'number'|'boolean'|'amount'|[string, number]} ParamType */
/**
 * @typedef {Object} MethodSpec
 * @property {Record<string, ParamType>} [params]
 * @property {(app: import('../pomona.js').Pomona, params: object) => unknown} run
 */

const PASSWORD = ['string', LIMITS.password.max]

/** @type {Record<string, MethodSpec>} */
export const METHODS = {
  // status
  status: { run: (app) => app.status() },

  // wallet
  createWallet: { params: { password: PASSWORD }, run: (app, p) => app.createWallet(p) },
  restoreWallet: { params: { seed: ['string', LIMITS.seed], password: PASSWORD }, run: (app, p) => app.restoreWallet(p) },
  unlock: { params: { password: PASSWORD }, run: (app, p) => app.unlock(p) },
  lock: { run: (app) => app.lock() },
  revealSeed: { params: { password: PASSWORD }, run: (app, p) => app.revealSeed(p) },
  sendUsdt: { params: { to: ['string', 64], amount: 'amount', password: PASSWORD }, run: (app, p) => app.sendUsdt(p) },
  faucet: { run: (app) => app.faucet() },

  // round
  createRound: {
    params: {
      title: ['string', LIMITS.title],
      mode: ['string', 8],
      website: ['string', LIMITS.website],
      network: ['string', 32],
      target: 'amount',
      minBid: 'amount',
      guide: 'amount',
      interval: ['string', 8],
      installments: 'number',
      biddingDays: 'number',
      biddingEnd: 'number',
      inviteOnly: 'boolean'
    },
    run: (app, p) => app.createRound(p)
  },
  join: { params: { link: ['string', LIMITS.link] }, run: (app, p) => app.join(p) },
  quoteBid: { params: { amount: 'amount' }, run: (app, p) => app.quoteBid(p) },
  bid: { params: { amount: 'amount' }, run: (app, p) => app.bid(p) },
  withdraw: { params: { amount: 'amount' }, run: (app, p) => app.withdraw(p) },
  invoice: { run: (app) => app.invoice() },
  quotePay: { params: { index: 'number' }, run: (app, p) => app.quotePay(p) },
  pay: { params: { index: 'number' }, run: (app, p) => app.pay(p) },
  invoiceDetails: { params: { index: 'number' }, run: (app, p) => app.invoiceDetails(p) },
  terminate: { run: (app) => app.terminate() },
  cancel: { run: (app) => app.cancel() },
  refund: { run: (app) => app.refund() },
  postNews: { params: { text: ['string', LIMITS.news] }, run: (app, p) => app.postNews(p) },
  invite: { run: (app) => app.invite() },

  // receipts
  receipt: { params: { index: 'number' }, run: (app, p) => app.receipt(p) },
  verifyReceipt: { params: { code: ['string', LIMITS.link] }, run: (app, p) => app.verifyReceipt(p) },

  // assistant ("Frag Pomona"): explains and prepares; nothing here can sign
  assistantAsk: { params: { text: ['string', 500], topic: ['string', 24] }, run: (app, p) => app.assistantAsk(p) },
  assistantInstall: { params: { model: ['string', 8] }, run: (app, p) => app.assistantInstall(p) },
  assistantReset: { run: (app) => app.assistantReset() },

  // helpers
  qr: { params: { text: ['string', LIMITS.link] }, run: (_app, p) => import('../pomona.js').then((m) => m.qrSvg(p.text ?? '')) }
}
