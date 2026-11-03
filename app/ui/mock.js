/**
 * In-browser stand-in for the Bare worker, for design previews only
 * (`npm run preview`). Same method names and status shape as the real core
 * (see docs/RPC.md).
 * Scenario via ?s=onboarding|locked|start|fund|newbidder|bidder|organizer|invoice|receipts|completed|failed
 * Rounds "Per Rechnung": ?s=payg-bidding|payg|payg-organizer
 */
;(function () {
  // ?s=bidder, or #bidder (artifact pages pass only a plain hash)
  const scenario = new URLSearchParams(window.location.search).get('s') || window.location.hash.slice(1) || 'bidder'
  window.addEventListener('hashchange', () => window.location.reload())
  const now = Math.floor(Date.now() / 1000)
  const DAY = 86400
  const MONTH = 30 * DAY
  const qr = (text) => { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) }
  const link = 'pomona://eyJ2IjoxLCJtIjoiYTdmMGM5ZTQxYjJkNjhmMzBlNWE5Yzc0ZDFiOGUyZjZhMzBjOTRlN2IxZDVmMjhhNmMwZTNiOWQ0ZjdhMmUxYyIsIm4iOiJzZXBvbGlhIiwiciI6IjB4N2E0QjlmMDJjRTFkOEE2ZjMwRTU5YzdEMWI4RTJGNmEzMEM5NEU3YiJ9'
  const wallet = { state: 'unlocked', kind: 'smart', address: '0x5C3e9A0bD41f7E28c6B9a3F1d02E8c7B4a6D9e10', usdt: '2400', symbol: 'USDT' }

  /** Same rules as Pomona._invoices / _invoicesPayg in core/pomona.js. */
  function plan (r) {
    if (r.mode === 'invoice') {
      const mine = Number(r.myPledge) > 0
      const upcoming = r.phase === 'bidding' || r.phase === 'running'
      return Array.from({ length: r.installments }, (_, i) => {
        const dueAt = r.biddingEnd + r.interval * i
        const issued = i < r.invoiceCount
        if (mine) {
          const paid = i < (r.paidMine ?? 0)
          return { index: i, dueAt, paidAt: paid ? dueAt + 7200 : null, amount: r.myPledge, status: paid ? 'paid' : issued ? 'open' : upcoming ? 'scheduled' : 'void', mine }
        }
        if (!issued) return { index: i, dueAt, paidAt: null, amount: r.total, status: upcoming ? 'scheduled' : 'void', mine }
        const missing = i === r.invoiceCount - 1 ? 3 : i === r.invoiceCount - 2 ? 1 : 0
        return { index: i, dueAt, paidAt: null, amount: r.total, status: 'issued', paidCount: r.bidders - missing, paidSum: String(Number(r.total) - missing * 100), mine }
      })
    }
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
      website: 'https://lindenhof.example/',
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
    openInvoices(r)
    stats(r)
    return r
  }
  /** Average and median like core bidStats(); the median is made up for the preview. */
  function stats (r) {
    r.average = r.bidders ? String(Math.round(Number(r.total) / r.bidders * 100) / 100) : null
    r.median = r.bidders ? String(Math.round(Number(r.total) / r.bidders * 0.9)) : null
  }
  function openInvoices (r) {
    const open = r.mode === 'invoice' ? r.invoices.filter((x) => x.status === 'open') : []
    r.openInvoices = open.length
    r.openAmount = String(open.length * Number(r.myPledge))
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
    'payg-bidding': () => ({ ...base, wallet: { ...wallet, usdt: '0' }, round: round({ mode: 'invoice' }) }),
    payg: () => ({ ...base, wallet, round: round({ mode: 'invoice', ...running, canInvoice: false, myPledge: '100', myDeposit: '0', paidMine: 2 }) }),
    'payg-organizer': () => ({ ...base, wallet, round: round({ mode: 'invoice', role: 'organizer', ...running, canInvoice: false }) }),
    failed: () => ({ ...base, wallet, round: round({ phase: 'failed', total: '2230', progress: 2230 / 4000, biddingEnd: now - DAY, myPledge: '80', myDeposit: '960', refundable: '960' }) })
  }
  const state = (scenarios[scenario] || scenarios.bidder)()
  state.busyStep = null
  state.version = '0.3.0'

  // Assistant: the real knowledge/intent/action modules from core/agent run in
  // the browser too; only the language model is simulated (?ai=ready).
  const aiParam = new URLSearchParams(window.location.search).get('ai')
  const ai = { state: aiParam === 'ready' ? 'ready' : 'none', model: null, progress: null, error: null, missing: false, manual: aiParam === 'manual' ? { dir: '/Users/anna/pomona-models' } : null }
  let manualTries = 0
  let agent = null
  const loadAgent = async () => {
    if (!agent) {
      const [K, I, A] = await Promise.all([import('../core/agent/knowledge.js'), import('../core/agent/intents.js'), import('../core/agent/actions.js')])
      agent = { K, I, A }
    }
    return agent
  }
  const MODELS = [
    { key: 'small', label: 'Kompakt', size: '1,1 GB', note: '', file: 'Qwen3-1.7B-Q4_0.gguf', url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/d7f544eead698dbd1f15126ef60b45a1e1933222/Qwen3-1.7B-Q4_0.gguf' },
    { key: 'better', label: 'Genauer', size: '2,5 GB', note: '', file: 'Qwen3-4B-Q4_K_M.gguf', url: null }
  ]
  const update = new URLSearchParams(window.location.search).get('update')
  const listeners = []
  const changed = () => { for (const fn of listeners) fn() }
  /** Simulates a transaction: busy with progress steps, ~2 s. */
  const tx = async (name) => {
    for (const step of ['prepare', 'sign', 'confirm']) {
      state.busy = name
      state.busyStep = step
      changed()
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
    state.busy = null
    state.busyStep = null
  }
  // For screenshots: simulate an incoming transfer.
  window.__mockDeposit = (amount) => { state.wallet.usdt = String(Number(state.wallet.usdt) + amount); changed() }
  const seed = 'apfel birne wiese ernte korb sonne regen erde samen blüte frucht garten'
  const receiptCode = (i) => 'pomona-beleg://eyJ2IjoxLCJuIjoiYXJiaXRydW0tc2Vwb2xpYSIsInIiOiIweDdhNEI5ZjAyY0UxZDhBNmYzMEU1OWM3RDFiOEUyRjZhMzBDOTRFN2IiLCJiIjoiMHg1QzNlOUEwYkQ0MWY3RTI4YzZCOWEzRjFkMDJFOGM3QjRhNkQ5ZTEwIiwiaSI6' + i + 'fQ'

  window.pomona = {
    async call (method, params = {}) {
      await new Promise((resolve) => setTimeout(resolve, 120))
      switch (method) {
        case 'status': {
          const { K } = await loadAgent()
          state.assistant = { ...ai, models: ai.manual ? MODELS.filter((m) => m.url) : MODELS, suggestions: K.suggestions(state) }
          return structuredClone(state)
        }
        case 'assistantAsk': {
          const { K, I, A } = await loadAgent()
          await new Promise((resolve) => setTimeout(resolve, 600))
          const finish = (a, source) => ({ reply: a.text, actions: A.validateActions(a.actions, state), source })
          if (params.topic) return finish(K.answerTopic(params.topic, state), 'topic')
          const intent = I.matchIntent(params.text, state)
          if (intent) return finish(intent, 'rules')
          if (ai.state === 'ready') {
            await new Promise((resolve) => setTimeout(resolve, 900))
            const r = state.round
            return finish({
              text: `Gern! Der Richtwert liegt bei ${r?.guide ?? 100} USDT pro Monat. Wenn du etwas mehr geben kannst, hilft das anderen, die weniger können. Ich habe dir 120 USDT vorbereitet; prüfen und bestätigen musst du selbst.`,
              actions: r?.phase === 'bidding' ? [{ type: 'bid', amount: '120' }] : []
            }, 'model')
          }
          const topic = K.matchTopic(params.text)
          if (topic) return finish(K.answerTopic(topic, state), 'faq')
          return finish({ text: 'Diese Frage kann ich ohne Sprachmodell noch nicht beantworten. Richte den Assistenten einmalig ein (läuft dann offline auf deinem Gerät) oder tippe auf einen Vorschlag.', actions: [{ type: 'install' }] }, 'none')
        }
        case 'assistantInstall': {
          ai.model = params.model || 'small'
          if (ai.manual && manualTries++ === 0) { // first try: file not there yet
            ai.state = 'error'; ai.missing = true; ai.error = 'Die Modelldatei ist noch nicht im Ordner.'
            return { started: true }
          }
          ai.missing = false
          ai.error = null
          ai.state = 'downloading'
          ai.progress = 0
          const tick = () => {
            ai.progress = Math.min(1, ai.progress + 0.17)
            if (ai.progress >= 1) ai.state = 'ready'
            changed()
            if (ai.state !== 'ready') setTimeout(tick, 400)
          }
          setTimeout(tick, 300)
          return { started: true }
        }
        case 'assistantReset': return null
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
          const deposit = r.mode === 'invoice' ? 0 : n * r.installments
          const balance = Number(state.wallet.usdt)
          return {
            mode: r.mode || 'deposit',
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
          const payg = r.mode === 'invoice'
          r.myDeposit = payg ? '0' : String(Number(r.myPledge) * r.installments)
          r.total = String(Number(r.total) + n)
          r.progress = Number(r.total) / Number(r.target)
          r.bidders += 1
          stats(r)
          if (!payg) state.wallet.usdt = String(Number(state.wallet.usdt) - n * r.installments)
          r.invoices = plan(r)
          return null
        }
        case 'quotePay': {
          const r = state.round
          const list = r.invoices.filter((x) => x.status === 'open' && (params.index == null || x.index === params.index))
          const amount = list.length * Number(r.myPledge)
          const balance = Number(state.wallet.usdt)
          return { invoices: list.map((x) => x.index + 1), amount: String(amount), fee: '0.0287', balance: String(balance), enough: balance >= amount, missing: String(Math.max(0, amount - balance)), symbol: 'USDT' }
        }
        case 'pay': {
          const r = state.round
          const list = r.invoices.filter((x) => x.status === 'open' && (params.index == null || x.index === params.index))
          await tx('pay')
          state.wallet.usdt = String(Number(state.wallet.usdt) - list.length * Number(r.myPledge))
          r.paidMine = Math.max(r.paidMine ?? 0, ...list.map((x) => x.index + 1))
          r.invoices = plan(r)
          openInvoices(r)
          return null
        }
        case 'invoiceDetails': {
          const r = state.round
          const inv = r.invoices[params.index]
          const n = r.bidders - inv.paidCount
          return {
            index: params.index,
            dueAt: inv.dueAt,
            paidCount: inv.paidCount,
            paidSum: inv.paidSum,
            total: r.total,
            bidders: r.bidders,
            unpaid: Array.from({ length: n }, (_, k) => ({ bidder: ['0x8b1F4c2a90D3e5f7A6b2C9d0E1f3A4b5C6d7E8f9', '0x2C4e6A8b0D1f3E5a7C9b2D4f6A8c0E2b4D6f8A1c', '0xF0e1D2c3B4a5968778695A4b3C2d1E0f9A8b7C6d'][k % 3], amount: '100' })),
            symbol: 'USDT'
          }
        }
        // The other transactions, simulated with the same progress steps.
        case 'withdraw': {
          const r = state.round
          await tx('withdraw')
          const pledge = Number(r.myPledge)
          state.wallet.usdt = String(Number(state.wallet.usdt) + pledge * r.installments)
          r.total = String(Number(r.total) - pledge)
          r.progress = Number(r.total) / Number(r.target)
          r.bidders = Math.max(0, r.bidders - 1)
          r.myPledge = '0'
          r.myDeposit = '0'
          r.invoices = plan(r)
          return null
        }
        case 'refund': {
          const r = state.round
          await tx('refund')
          state.wallet.usdt = String(Number(state.wallet.usdt) + Number(r.refundable))
          r.refundable = '0'
          return null
        }
        case 'invoice': {
          const r = state.round
          await tx('invoice')
          state.wallet.usdt = String(Number(state.wallet.usdt) + Number(r.total))
          r.invoiceCount += 1
          r.canInvoice = false
          r.nextInvoiceAt = r.biddingEnd + r.interval * r.invoiceCount
          r.invoices = plan(r)
          return null
        }
        case 'cancel': {
          const r = state.round
          await tx('cancel')
          r.phase = 'failed'
          r.refundable = r.myDeposit
          r.invoices = plan(r)
          return null
        }
        case 'terminate': {
          const r = state.round
          await tx('terminate')
          r.phase = 'completed'
          r.canInvoice = false
          r.refundable = String(Number(r.myPledge) * (r.installments - r.invoiceCount))
          r.invoices = plan(r)
          return null
        }
        case 'postNews':
          state.round.news.unshift({ text: String(params.text), at: Date.now() })
          return null
        case 'faucet':
          await tx('faucet')
          state.wallet.usdt = String(Number(state.wallet.usdt) + 5000)
          return null
        case 'join': {
          if (!String(params.link).startsWith('pomona://')) throw Object.assign(new Error('Das ist kein Pomona-Einladungslink.'), { code: 'BAD_LINK' })
          await new Promise((resolve) => setTimeout(resolve, 600))
          state.round = round({ mode: 'invoice' })
          return structuredClone(state)
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
