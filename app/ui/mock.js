/**
 * In-browser stand-in for the Bare worker, for design previews only
 * (`npm run preview`). Same method names and status shape as the real core.
 * Scenario via ?s=onboarding|locked|start|bidder|organizer|invoice|receipts|completed|failed
 */
;(function () {
  const scenario = new URLSearchParams(window.location.search).get('s') || 'bidder'
  const now = Math.floor(Date.now() / 1000)
  const DAY = 86400
  const MONTH = 30 * DAY
  const qr = (text) => { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) }
  const link = 'pomona://eyJ2IjoxLCJtIjoiYTdmMGM5ZTQxYjJkNjhmMzBlNWE5Yzc0ZDFiOGUyZjZhMzBjOTRlN2IxZDVmMjhhNmMwZTNiOWQ0ZjdhMmUxYyIsIm4iOiJzZXBvbGlhIiwiciI6IjB4N2E0QjlmMDJjRTFkOEE2ZjMwRTU5YzdEMWI4RTJGNmEzMEM5NEU3YiJ9'

  const round = (over) => Object.assign({
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
    progress: 3250 / 4000,
    interval: MONTH,
    intervalName: 'month',
    installments: 12,
    invoiceCount: 0,
    biddingEnd: now + 12 * DAY,
    nextInvoiceAt: now + 12 * DAY,
    expiresAt: now + 12 * DAY + 12 * MONTH,
    now,
    phase: 'bidding',
    canInvoice: false,
    inviteOnly: true,
    bidders: 27,
    myPledge: '0',
    myDeposit: '0',
    refundable: '0',
    receipts: [],
    news: [
      { text: 'Hofführung am Samstag um 14 Uhr – alle Bietenden sind herzlich eingeladen.', at: Date.now() - 3600e3 * 5 },
      { text: 'Willkommen zur Bietrunde 2027! Richtwert sind 100 USDT im Monat.', at: Date.now() - 86400e3 * 3 }
    ]
  }, over)

  const running = {
    phase: 'running',
    total: '4150',
    progress: 4150 / 4000,
    bidders: 38,
    biddingEnd: now - 2 * MONTH - 3 * DAY,
    invoiceCount: 3,
    nextInvoiceAt: now - 3 * DAY,
    canInvoice: true
  }
  const receipts = [0, 1, 2].map((i) => ({ index: i, amount: '100', paidAt: now - (2 - i) * MONTH - 3 * DAY }))

  const wallet = { state: 'unlocked', kind: 'smart', address: '0x5C3e9A0bD41f7E28c6B9a3F1d02E8c7B4a6D9e10', usdt: '2400', symbol: 'USDT' }
  const base = {
    network: { id: 'sepolia', name: 'Ethereum Sepolia (Test)', dev: false, explorer: null },
    networks: [{ id: 'sepolia', name: 'Ethereum Sepolia (Test)', ready: true }, { id: 'ethereum', name: 'Ethereum', ready: false }],
    peers: 6,
    busy: null
  }
  const scenarios = {
    onboarding: { ...base, wallet: { state: 'none', symbol: 'USDT' }, round: null },
    locked: { ...base, wallet: { state: 'locked', symbol: 'USDT' }, round: null },
    start: { ...base, wallet, round: null },
    bidder: { ...base, wallet, round: round({ myPledge: '100', myDeposit: '1200' }) },
    organizer: { ...base, wallet, round: round({ role: 'organizer' }) },
    invoice: { ...base, wallet, round: round({ role: 'organizer', ...running }) },
    receipts: { ...base, wallet, round: round({ ...running, canInvoice: false, nextInvoiceAt: now + 27 * DAY, myPledge: '100', myDeposit: '1200', receipts }) },
    completed: { ...base, wallet, round: round({ ...running, phase: 'completed', canInvoice: false, myPledge: '100', myDeposit: '1200', receipts, refundable: '900' }) },
    failed: { ...base, wallet, round: round({ phase: 'failed', total: '2230', progress: 2230 / 4000, biddingEnd: now - DAY, myPledge: '80', myDeposit: '960', refundable: '960' }) }
  }
  const state = structuredClone(scenarios[scenario] || scenarios.bidder)
  const seed = 'apfel birne wiese ernte korb sonne regen erde samen blüte frucht garten'

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
        case 'receipt': {
          const code = 'pomona-beleg://eyJ2IjoxLCJuIjoic2Vwb2xpYSIsInIiOiIweDdhNEI5ZjAyY0UxZDhBNmYzMEU1OWM3RDFiOEUyRjZhMzBDOTRFN2IiLCJiIjoiMHg1QzNlOUEwYkQ0MWY3RTI4YzZCOWEzRjFkMDJFOGM3QjRhNkQ5ZTEwIiwiaSI6' + params.index + 'fQ'
          return { code, qr: qr(code) }
        }
        case 'verifyReceipt': return { valid: true, title: state.round?.title, round: state.round?.address, bidder: wallet.address, installment: 2, installments: 12, amount: '100', symbol: 'USDT', paidAt: now - MONTH }
        case 'bid': {
          const r = state.round
          const n = Number(String(params.amount).replace(',', '.'))
          r.myPledge = String(Number(r.myPledge) + n)
          r.myDeposit = String(Number(r.myPledge) * r.installments)
          r.total = String(Number(r.total) + n)
          r.progress = Number(r.total) / Number(r.target)
          return null
        }
        default: return null
      }
    },
    on () {},
    copy () { return Promise.resolve() }
  }
})()
