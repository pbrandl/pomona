/**
 * In-browser stand-in for the Bare worker, for design previews only
 * (`npm run preview`). Same method names and status shape as the real core
 * (see docs/RPC.md).
 * Scenario via ?s=onboarding|locked|start|fund|newbidder|bidder|organizer|invoice|receipts|completed|failed
 */
;(function () {
  const scenario = new URLSearchParams(window.location.search).get('s') || 'bidder'
  const now = Math.floor(Date.now() / 1000)
  const DAY = 86400
  const MONTH = 30 * DAY
  const qr = (text) => { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) }
  const link = 'pomona://eyJ2IjoxLCJtIjoiYTdmMGM5ZTQxYjJkNjhmMzBlNWE5Yzc0ZDFiOGUyZjZhMzBjOTRlN2IxZDVmMjhhNmMwZTNiOWQ0ZjdhMmUxYyIsIm4iOiJzZXBvbGlhIiwiciI6IjB4N2E0QjlmMDJjRTFkOEE2ZjMwRTU5YzdEMWI4RTJGNmEzMEM5NEU3YiJ9'
  const wallet = { state: 'unlocked', kind: 'smart', address: '0x5C3e9A0bD41f7E28c6B9a3F1d02E8c7B4a6D9e10', usdt: '2400', symbol: 'USDT' }

  /** Same rules as Pomona._invoices in core/pomona.js. */
  function plan (r) {
    return Array.from({ length: r.installments }, (_, i) => {
      const dueAt = r.biddingEnd + r.interval * i
      let status = 'void'
      if (i < r.invoiceCount) status = 'paid'
      else if (r.phase === 'running' && i === r.invoiceCount && r.canInvoice) status = 'due'
      else if (r.phase === 'bidding' || r.phase === 'running') status = 'scheduled'
      const mine = Number(r.myPledge) > 0
      return { index: i, dueAt, paidAt: i < r.invoiceCount ? dueAt + 3600 : null, amount: mine ? r.myPledge : r.total, status, mine }
    })
  }

  const round = (over) => {
    const r = Object.assign({
      role: 'bidder',
      title: 'Solawi Lindenhof 2027',
      description: 'Gemüse für 40 Haushalte, April bis März. Jeder gibt, was er kann.',
      verified: true,
      address: '0x7a4B9f02cE1d8A6f30E59c7D1b8E2F6a30C94E7b',
      organizer: '0x1111111111111111111111111111111111111111',
      symbol: 'USDT',
      target: '4000',
      total: '3250',
      minBid: '25',
      guide: '100',
      progress: 3250 / 4000,
      interval: MONTH,
      intervalName: 'month',
      installments: 12,
      invoiceCount: 0,
      biddingStart: now - 9 * DAY,
      biddingEnd: now + 12 * DAY,
      now,
      phase: 'bidding',
      canInvoice: false,
      inviteOnly: true,
      bidders: 27,
      myPledge: '0',
      myDeposit: '0',
      refundable: '0',
      news: [
        { text: 'Hofführung am Samstag um 14 Uhr – alle Bietenden sind herzlich eingeladen.', at: Date.now() - 3600e3 * 5 },
        { text: 'Willkommen zur Bietrunde 2027! Richtwert sind 100 USDT im Monat.', at: Date.now() - 86400e3 * 3 }
      ]
    }, over)
    r.nextInvoiceAt = r.biddingEnd + r.interval * r.invoiceCount
    r.expiresAt = r.biddingEnd + r.interval * r.installments
    r.invoices = plan(r)
    return r
  }

  const running = {
    phase: 'running',
    total: '4150',
    progress: 4150 / 4000,
    bidders: 38,
    biddingStart: now - 2 * MONTH - 17 * DAY,
    biddingEnd: now - 2 * MONTH - 3 * DAY,
    invoiceCount: 3,
    canInvoice: true
  }
  const mine = { myPledge: '100', myDeposit: '1200' }

  const base = {
    network: { id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia (Test)', dev: false, explorer: null },
    networks: [{ id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia (Test)', ready: true }, { id: 'arbitrum', name: 'Arbitrum One', ready: false }, { id: 'sepolia', name: 'Ethereum Sepolia (Test)', ready: true }],
    peers: 6,
    busy: null
  }
  const scenarios = {
    onboarding: () => ({ ...base, wallet: { state: 'none', symbol: 'USDT' }, round: null }),
    locked: () => ({ ...base, wallet: { state: 'locked', symbol: 'USDT' }, round: null }),
    start: () => ({ ...base, wallet, round: null }),
    fund: () => ({ ...base, wallet: { ...wallet, usdt: '0' }, round: round() }),
    newbidder: () => ({ ...base, wallet, round: round() }),
    bidder: () => ({ ...base, wallet, round: round(mine) }),
    organizer: () => ({ ...base, wallet, round: round({ role: 'organizer' }) }),
    invoice: () => ({ ...base, wallet, round: round({ role: 'organizer', ...running }) }),
    receipts: () => ({ ...base, wallet, round: round({ ...running, canInvoice: false, biddingStart: now - 3 * MONTH, biddingEnd: now - 2 * MONTH - 10 * DAY, ...mine }) }),
    completed: () => ({ ...base, wallet, round: round({ ...running, phase: 'completed', canInvoice: false, ...mine, refundable: '900' }) }),
    failed: () => ({ ...base, wallet, round: round({ phase: 'failed', total: '2230', progress: 2230 / 4000, biddingEnd: now - DAY, myPledge: '80', myDeposit: '960', refundable: '960' }) })
  }
  const state = (scenarios[scenario] || scenarios.bidder)()
  state.busyStep = null
  state.version = '0.3.0'
  const update = new URLSearchParams(window.location.search).get('update')
  const listeners = []
  const changed = () => { for (const fn of listeners) fn() }
  // For screenshots: simulate an incoming transfer.
  window.__mockDeposit = (amount) => { state.wallet.usdt = String(Number(state.wallet.usdt) + amount); changed() }
  const seed = 'apfel birne wiese ernte korb sonne regen erde samen blüte frucht garten'
  const receiptCode = (i) => 'pomona-beleg://eyJ2IjoxLCJuIjoiYXJiaXRydW0tc2Vwb2xpYSIsInIiOiIweDdhNEI5ZjAyY0UxZDhBNmYzMEU1OWM3RDFiOEUyRjZhMzBDOTRFN2IiLCJiIjoiMHg1QzNlOUEwYkQ0MWY3RTI4YzZCOWEzRjFkMDJFOGM3QjRhNkQ5ZTEwIiwiaSI6' + i + 'fQ'

  window.pomona = {
    async call (method, params = {}) {
      await new Promise((resolve) => setTimeout(resolve, 120))
      switch (method) {
        case 'status': return structuredClone(state)
        case 'invite': return { link, qr: qr(link) }
        case 'qr': return qr(params.text)
        case 'createWallet': state.wallet = wallet; return { seed, address: wallet.address }
        case 'unlock': state.wallet = wallet; return { address: wallet.address }
        case 'lock': state.wallet = { state: 'locked', symbol: 'USDT' }; return null
        case 'revealSeed': return seed
        case 'receipt': { const code = receiptCode(params.index); return { code, qr: qr(code) } }
        case 'verifyReceipt': {
          await new Promise((resolve) => setTimeout(resolve, 500))
          if (!String(params.code).startsWith('pomona-beleg://')) return { valid: false, reason: 'Das ist kein Beleg.' }
          return { valid: true, title: state.round?.title, round: state.round?.address, bidder: wallet.address, installment: 2, installments: 12, amount: '100', symbol: 'USDT', paidAt: now - MONTH }
        }
        case 'quoteBid': {
          const r = state.round
          const n = Number(String(params.amount).replace(/\./g, '').replace(',', '.'))
          const deposit = n * r.installments
          const balance = Number(state.wallet.usdt)
          return {
            amount: String(n),
            pledgeAfter: String(Number(r.myPledge) + n),
            installments: r.installments,
            deposit: String(deposit),
            fee: '0.0312',
            balance: String(balance),
            enough: balance >= deposit,
            missing: String(Math.max(0, deposit - balance)),
            symbol: 'USDT'
          }
        }
        case 'bid': {
          const r = state.round
          const n = Number(String(params.amount).replace(/\./g, '').replace(',', '.'))
          for (const step of ['prepare', 'sign', 'confirm']) {
            state.busy = 'bid'
            state.busyStep = step
            changed()
            await new Promise((resolve) => setTimeout(resolve, 900))
          }
          state.busy = null
          state.busyStep = null
          r.myPledge = String(Number(r.myPledge) + n)
          r.myDeposit = String(Number(r.myPledge) * r.installments)
          r.total = String(Number(r.total) + n)
          r.progress = Number(r.total) / Number(r.target)
          r.bidders += 1
          state.wallet.usdt = String(Number(state.wallet.usdt) - n * r.installments)
          r.invoices = plan(r)
          return null
        }
        default: return null
      }
    },
    on (event, fn) {
      if (event === 'change') listeners.push(fn)
      if (event === 'update' && update) setTimeout(() => fn({ version: update }), 300)
    },
    restart () { window.location.reload(); return Promise.resolve() },
    copy () { return Promise.resolve() },
    cameraAccess () { return Promise.resolve(true) }
  }
})()
