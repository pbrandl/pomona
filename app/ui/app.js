/**
 * Pomona UI. Plain JS, no framework:
 *
 *   state (ui) ──render()──▶ HTML (views/*) ──data-action──▶ actions ──▶ backend
 *        ▲                                                         │
 *        └──────────────── status() on every 'change' event ◀──────┘
 *
 * The backend (`window.pomona`) is the Bare worker (ui/pear.js) inside Pear or
 * an in-memory mock (ui/mock.js) for design previews. It exposes exactly the
 * methods in core/rpc/methods.js.
 *
 * To add a feature: add a view function (views/*), give its buttons a
 * `data-action`, and add the action below.
 *
 * @module ui/app
 */
import { esc, short, fmt, isoDay, endOfDay } from './format.js'
import { PEAR } from './views/parts.js'
import { onboarding, locked, createWalletSheet, restoreSheet, revealSheet, seedSheet } from './views/onboarding.js'
import { start, createPage, joinPage, createStepError } from './views/start.js'
import { round, newsPage } from './views/round.js'
import { walletSheet } from './views/wallet.js'
import { receiptSheet, invoiceSheet, scanSheet } from './views/receipt.js'
import { Scanner } from './scanner.js'
import { fundSheet } from './views/fund.js'
import { bidPage } from './views/bid.js'
import { assistantPage, SPARK } from './views/assistant.js'
import { changes, deliver } from './notify.js'

const $app = document.getElementById('app')

/** All UI state. The backend status is the source of truth; the rest is view state. */
const ui = {
  status: null,
  tab: 'create', // start screen: 'create' | 'join'
  sheet: null, // 'wallet' | 'create-wallet' | 'restore' | 'reveal' | 'seed' | 'receipt' | 'invoice' | 'scan'
  seed: null, // shown once after creating, or after re-entering the password
  invite: null, // { link, qr }
  addressQr: null,
  receipt: null, // { index, code, qr, verified }
  invoiceIndex: null, // organizer: which paid invoice is open
  verified: null, // result of verifyReceipt in the scan sheet
  scanError: null, // camera unavailable → paste only
  showAllInvoices: false,
  showAllNews: false,
  quote: null, // quoteBid result while the bid confirmation is open
  bidDone: null, // { pledgeAfter, deposit } after a successful bid
  fundBaseline: null, // balance when "Aufladen" was opened, to show what arrived
  showSend: false,
  update: null, // { version } when a new app version is ready
  onboarding: false, // first start: Passwort → Notfall-Wörter → Aufladen
  createStep: 0, // "Runde starten": 0 Runde, 1 Bietphase, 2 Raten, 3 Prüfen
  bidStep: 'amount', // "Bieten": amount → review → done
  chat: [], // "Frag Pomona": [{ role, text, actions, source }]
  toast: null,
  pending: null, // action currently running in the UI
  draft: {
    title: '',
    description: '',
    target: '',
    installments: '12',
    interval: 'month',
    endDate: isoDay(Math.floor(Date.now() / 1000) + 14 * 86400), // last day of bidding
    minBid: '',
    inviteOnly: true,
    network: '',
    link: '',
    amount: '',
    news: '',
    verify: '',
    restore: '',
    password: '',
    password2: '',
    sendTo: '',
    sendAmount: '',
    sendPassword: '',
    guide: '',
    ask: ''
  }
}

const call = (method, params) => window.pomona.call(method, params)

// ------------------------------------------------------------------- render

const SHEETS = {
  'create-wallet': createWalletSheet,
  restore: restoreSheet,
  reveal: revealSheet,
  seed: seedSheet,
  receipt: (u) => (u.receipt && u.status?.round ? receiptSheet(u) : ''),
  invoice: (u) => (u.invoiceIndex !== null && u.status?.round ? invoiceSheet(u) : ''),
  scan: scanSheet,
  fund: (u) => (u.status?.wallet.state === 'unlocked' ? fundSheet(u) : ''),
  bid: (u) => (u.status?.round ? bidPage(u) : ''),
  create: (u) => (u.status?.wallet.state === 'unlocked' ? createPage(u) : ''),
  join: (u) => (u.status?.wallet.state === 'unlocked' ? joinPage(u) : ''),
  assistant: (u) => (u.status?.wallet.state === 'unlocked' ? assistantPage(u) : ''),
  news: (u) => (u.status?.round?.role === 'organizer' ? newsPage(u) : ''),
  wallet: (u) => (u.status?.wallet.state === 'unlocked' ? walletSheet(u) : '')
}

function topbar () {
  const w = ui.status?.wallet
  const ask = `<button class="pill ask-pill" data-action="open-assistant" title="Frag Pomona">${SPARK}<span>Frag Pomona</span></button>`
  const right = w?.state === 'unlocked'
    ? `<div class="bar-right">${ask}<button class="pill" data-action="open-sheet" data-sheet="wallet"><span class="dot ${ui.status.peers > 0 ? 'on' : ''}" title="${ui.status.peers} Peers"></span>${fmt(w.usdt)} ${esc(w.symbol)}<span class="muted mono">${short(w.address)}</span></button></div>`
    : ''
  const update = ui.update
    ? `<div class="update-bar" role="status"><span>Neue Version von Pomona ist bereit.</span><button class="btn accent small" data-action="restart" ${ui.status?.busy ? 'disabled title="Nach der laufenden Transaktion"' : ''}>Neu starten</button></div>`
    : ''
  return `${update}<header class="bar"><div class="brand">${PEAR}Pomona</div>${right}</header>`
}

function body () {
  const s = ui.status
  if (!s) return '<div class="center-screen" style="align-items:center"><span class="spinner"></span></div>'
  if (s.wallet.state === 'none') return onboarding(ui)
  if (s.wallet.state === 'locked') return locked(ui)
  return s.round ? round(ui) : start(ui)
}

function render () {
  // Keep focus and caret across re-renders (status refreshes in the background).
  const active = document.activeElement
  const focusId = active?.id
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null

  // One step, one page: an open flow replaces the main view entirely.
  const flow = ui.sheet && SHEETS[ui.sheet] ? SHEETS[ui.sheet](ui) : ''
  const toast = ui.toast ? `<div class="toast ${ui.toast.error ? 'error' : ''}" role="status">${esc(ui.toast.text)}</div>` : ''
  $app.innerHTML = topbar() + `<main>${flow || body()}</main>` + toast
  const where = ui.sheet + ':' + ui.createStep + ':' + ui.bidStep
  if (where !== lastPage) { lastPage = where; window.scrollTo(0, 0) }

  if (focusId) {
    const el = document.getElementById(focusId)
    if (el) {
      el.focus()
      if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]) } catch {}
    }
  }
  scanner?.attach() // the camera <video> survives re-renders
}

let lastPage = ''
let receiptTimer = null

/** Sends a question (or a suggestion topic) and appends the answer. */
async function askAssistant (params) {
  try {
    const r = await call('assistantAsk', params)
    ui.chat.push({ role: 'bot', text: r.reply, actions: r.actions, source: r.source })
  } catch (e) {
    ui.chat.push({ role: 'bot', text: e.message, actions: [] })
  }
  ui.chat = ui.chat.slice(-40)
  render()
  scrollChat()
}

function scrollChat () {
  setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 30)
}

/** Camera scanner, alive only while the scan page is open. */
let scanner = null
function stopScanner () {
  scanner?.stop()
  scanner = null
}
async function startScanner () {
  stopScanner()
  ui.scanError = null
  scanner = new Scanner(async (code) => {
    scanner = null
    ui.draft.verify = code
    try {
      ui.verified = await call('verifyReceipt', { code })
    } catch (e) {
      ui.verified = { valid: false, reason: e.message }
    }
    render()
  })
  try {
    await scanner.start()
  } catch (e) {
    scanner = null
    ui.scanError = e.message
  }
}

let toastTimer = null
function toast (text, error = false) {
  ui.toast = { text, error }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { ui.toast = null; render() }, error ? 6000 : 3000)
  render()
}

async function refresh () {
  try {
    const prev = ui.status
    ui.status = await call('status')
    const s = ui.status
    deliver(changes(prev, s, { own: ui.pending }), (text) => toast(text))
    if (s.round?.role === 'organizer' && !ui.invite) ui.invite = await call('invite')
    if (s.wallet.address && !ui.addressQr) ui.addressQr = await call('qr', { text: s.wallet.address })
    if (s.wallet.state !== 'unlocked') ui.addressQr = null
  } catch (e) {
    toast(e.message, true)
  }
  render()
}

/** Calls the backend, then refreshes the status. */
async function run (method, params) {
  const result = await call(method, params)
  await refresh()
  return result
}

const clearPasswords = () => { ui.draft.password = ''; ui.draft.password2 = ''; ui.draft.sendPassword = '' }

// ------------------------------------------------------------------ actions

/** Every `data-action` in the views maps to one entry here. */
const actions = {
  tab: (el) => { ui.tab = el.dataset.tab },
  interval: (el) => { ui.draft.interval = el.dataset.interval },
  'open-sheet': (el) => { ui.sheet = el.dataset.sheet },
  'close-sheet': () => {
    ui.sheet = null
    ui.quote = null
    ui.bidDone = null
    ui.bidStep = 'amount'
    ui.onboarding = false
    clearPasswords()
    stopScanner()
  },
  async restart () {
    if (ui.status?.busy) throw new Error('Bitte warten, bis die Transaktion bestätigt ist.')
    await window.pomona.restart()
  },
  'open-create': () => { ui.createStep = 0; ui.sheet = 'create' },

  // "Frag Pomona"
  'open-assistant': () => { ui.sheet = 'assistant'; scrollChat() },
  async 'agent-send' () {
    const text = ui.draft.ask.trim()
    if (!text) return
    ui.draft.ask = ''
    ui.chat.push({ role: 'user', text })
    render()
    scrollChat()
    await askAssistant({ text })
  },
  async 'agent-topic' (el) {
    const q = ui.status.assistant.suggestions.find((x) => x.topic === el.dataset.topic)
    ui.chat.push({ role: 'user', text: q?.question ?? el.textContent })
    render()
    scrollChat()
    await askAssistant({ topic: el.dataset.topic })
  },
  async 'agent-install' (el) {
    await run('assistantInstall', { model: el.dataset.model || 'small' })
  },
  async 'agent-reset' () {
    ui.chat = []
    await call('assistantReset')
  },
  /** An action card: opens the matching page. The person confirms there. */
  async 'agent-act' (el) {
    const a = ui.chat[Number(el.dataset.msg)]?.actions?.[Number(el.dataset.act)]
    if (!a) return
    switch (a.type) {
      case 'bid':
        ui.draft.amount = a.amount
        ui.bidStep = 'amount'
        ui.sheet = 'bid'
        return actions['review-bid']()
      case 'open':
        if (a.page === 'fund') return actions['open-fund']()
        if (a.page === 'scan') return actions['open-scan']()
        if (a.page === 'create') return actions['open-create']()
        ui.sheet = a.page
        return
      case 'receipt':
        return actions['show-receipt']({ dataset: { index: String(a.index) } })
      case 'invoice':
        ui.sheet = null
        return actions.invoice()
      case 'withdraw':
        ui.sheet = null
        return actions.withdraw()
      case 'refund':
        if (!window.confirm(`${a.label}?`)) return
        ui.sheet = null
        return actions.refund()
      case 'news':
        ui.draft.news = a.text
        ui.sheet = 'news' // the person reads and sends it themselves
        return
      case 'install':
        return run('assistantInstall', { model: 'small' })
    }
  },
  'create-next': () => {
    const error = createStepError(ui)
    if (error) throw new Error(error)
    ui.createStep = Math.min(3, ui.createStep + 1)
  },
  'create-back': () => { ui.createStep = Math.max(0, ui.createStep - 1) },
  'start-bid': () => { ui.bidStep = 'amount'; ui.quote = null; ui.bidDone = null; ui.sheet = 'bid' },
  'bid-back': () => { ui.bidStep = 'amount'; ui.quote = null },
  'open-fund': () => { ui.fundBaseline = ui.status.wallet.usdt; ui.sheet = 'fund' },
  'create-wallet-start': () => { ui.onboarding = true; ui.sheet = 'create-wallet' },
  'toggle-send': () => { ui.showSend = !ui.showSend },
  'pick-amount': (el) => { ui.draft.amount = el.dataset.amount },

  'show-all-invoices': () => { ui.showAllInvoices = true },
  'show-all-news': () => { ui.showAllNews = true },

  // wallet
  async 'create-wallet' () {
    if (ui.draft.password !== ui.draft.password2) throw new Error('Die Passwörter stimmen nicht überein.')
    const { seed } = await run('createWallet', { password: ui.draft.password })
    clearPasswords()
    ui.seed = seed
    ui.sheet = 'seed'
    ui.onboarding = true
  },
  async restore () {
    await run('restoreWallet', { seed: ui.draft.restore, password: ui.draft.password })
    ui.draft.restore = ''
    clearPasswords()
    ui.sheet = null
    toast('Wallet wiederhergestellt')
  },
  async unlock () {
    await run('unlock', { password: ui.draft.password })
    clearPasswords()
  },
  async lock () {
    ui.sheet = null
    await run('lock')
  },
  async 'reveal-seed' () {
    ui.seed = await call('revealSeed', { password: ui.draft.password })
    clearPasswords()
    ui.sheet = 'seed'
  },
  'seed-done': () => {
    ui.seed = null
    ui.sheet = null
    // A new, empty wallet: the next step is always topping it up.
    if (ui.onboarding && Number(ui.status?.wallet.usdt || 0) === 0) {
      ui.fundBaseline = ui.status.wallet.usdt
      ui.sheet = 'fund'
    } else {
      ui.onboarding = false
    }
  },
  async faucet () {
    await run('faucet')
    toast('Testguthaben ist da')
  },
  async send () {
    if (!window.confirm(`${ui.draft.sendAmount} USDT an ${ui.draft.sendTo} senden?`)) return
    const password = ui.draft.sendPassword
    ui.draft.sendPassword = ''
    await run('sendUsdt', { to: ui.draft.sendTo.trim(), amount: ui.draft.sendAmount, password })
    ui.draft.sendTo = ''
    ui.draft.sendAmount = ''
    toast('Gesendet')
  },

  // round
  async 'create-round' () {
    const d = ui.draft
    await run('createRound', {
      title: d.title,
      description: d.description,
      target: d.target,
      minBid: d.minBid || '0',
      interval: d.interval,
      installments: Number(d.installments),
      biddingEnd: endOfDay(d.endDate),
      guide: d.guide || undefined,
      inviteOnly: d.inviteOnly,
      network: d.network || ui.status.network.id
    })
    ui.invite = await call('invite')
    ui.sheet = null
    ui.createStep = 0
    toast('Runde gestartet. Teile jetzt den Link.')
  },
  async join () {
    await run('join', { link: ui.draft.link.trim() })
    ui.draft.link = ''
    ui.sheet = null
  },
  /** Opens the confirmation with deposit, fee and balance check. */
  async 'review-bid' () {
    ui.quote = null
    ui.bidDone = null
    ui.bidStep = 'review'
    render()
    try {
      ui.quote = await call('quoteBid', { amount: ui.draft.amount })
    } catch (e) {
      ui.bidStep = 'amount'
      throw e
    }
  },
  async 'confirm-bid' () {
    const q = ui.quote
    await run('bid', { amount: ui.draft.amount })
    ui.bidDone = { pledgeAfter: q.pledgeAfter, deposit: q.deposit }
    ui.bidStep = 'done'
    ui.draft.amount = ''
  },
  async withdraw () {
    if (!window.confirm('Dein ganzes Gebot zurückziehen? Der hinterlegte Betrag geht zurück in deine Wallet.')) return
    await run('withdraw', { amount: 'all' })
    toast('Gebot zurückgezogen')
  },
  async invoice () {
    const r = ui.status.round
    if (!window.confirm(`Rate ${r.invoiceCount + 1} von ${r.installments} abrechnen? ${r.total} ${r.symbol} gehen an deine Wallet.`)) return
    await run('invoice')
    toast('Rate abgerechnet. Die Bietenden haben ihren Beleg.')
  },
  async refund () {
    await run('refund')
    toast('Betrag ist zurück in deiner Wallet')
  },
  async cancel () {
    if (!window.confirm('Runde wirklich abbrechen? Alle Bietenden bekommen ihr Geld zurück.')) return
    await run('cancel')
  },
  async terminate () {
    if (!window.confirm('Runde vorzeitig beenden? Es können keine weiteren Raten abgerechnet werden; der Rest geht an die Bietenden zurück.')) return
    await run('terminate')
  },
  async 'post-news' () {
    if (!ui.draft.news.trim()) throw new Error('Bitte eine Nachricht schreiben.')
    await run('postNews', { text: ui.draft.news })
    ui.draft.news = ''
    ui.sheet = null
    toast('Neuigkeit gesendet')
  },

  // receipts
  /** Bidder taps a paid installment: show the receipt and verify it on-chain. */
  async 'show-receipt' (el) {
    const index = Number(el.dataset.index)
    ui.receipt = { index, ...(await call('receipt', { index })), verified: null }
    ui.sheet = 'receipt'
    render()
    const rc = ui.receipt
    call('verifyReceipt', { code: rc.code })
      .then((v) => { rc.verified = v }, (e) => { rc.verified = { valid: false, reason: e.message } })
      .finally(render)
    // Signed receipts expire after 10 minutes: renew while the page is open.
    clearInterval(receiptTimer)
    receiptTimer = setInterval(async () => {
      if (ui.sheet !== 'receipt' || ui.receipt?.index !== index) return clearInterval(receiptTimer)
      try { Object.assign(ui.receipt, await call('receipt', { index })); render() } catch {}
    }, 4 * 60 * 1000)
  },
  /** Organizer taps a paid invoice. */
  'show-invoice' (el) {
    ui.invoiceIndex = Number(el.dataset.index)
    ui.sheet = 'invoice'
  },
  async 'open-scan' () {
    ui.verified = null
    ui.draft.verify = ''
    ui.sheet = 'scan'
    render()
    await startScanner()
  },
  async 'scan-again' () {
    ui.verified = null
    ui.draft.verify = ''
    render()
    await startScanner()
  },
  async 'verify-receipt' () {
    stopScanner()
    ui.verified = await call('verifyReceipt', { code: ui.draft.verify.trim() })
  },

  // clipboard
  async 'copy-invite' () { await window.pomona.copy(ui.invite.link); toast('Link kopiert') },
  async 'copy-models-dir' () { await window.pomona.copy(ui.status.assistant.manual.dir); toast('Ordner kopiert') },
  async 'copy-address' () { await window.pomona.copy(ui.status.wallet.address); toast('Adresse kopiert') },
  async 'copy-receipt' () { await window.pomona.copy(ui.receipt.code); toast('Beleg kopiert') }
}

// ------------------------------------------------------------------- events

$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]')
  if (!el || el.disabled) return
  // Clicks inside a sheet must not reach the backdrop's close action.
  if (el.classList.contains('sheet-backdrop') && e.target.closest('[data-stop]')) return
  const fn = Object.hasOwn(actions, el.dataset.action) ? actions[el.dataset.action] : null
  if (!fn) return
  ui.pending = el.dataset.action
  render()
  try {
    await fn(el)
  } catch (err) {
    toast(err.message, true)
  } finally {
    ui.pending = null
    render()
  }
})

const syncDraft = (e) => {
  const key = e.target.dataset?.draft
  if (key && Object.hasOwn(ui.draft, key)) ui.draft[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value
}
$app.addEventListener('input', (e) => {
  syncDraft(e)
  // Live previews (deposit hint, summary) without losing focus.
  if (['amount', 'target', 'installments'].includes(e.target.id)) render()
})
$app.addEventListener('change', (e) => {
  syncDraft(e)
  if (e.target.id === 'endDate') render()
})

/** Enter submits the obvious action of a field. */
const ENTER = { amount: 'review-bid', password: null, verify: 'verify-receipt', link: 'join', ask: 'agent-send' }
$app.addEventListener('keydown', (e) => {
  // Clickable rows (role="button") react to Enter and Space like buttons.
  if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute?.('role') === 'button') {
    e.preventDefault()
    e.target.click()
    return
  }
  if (e.key !== 'Enter' || e.shiftKey || !Object.hasOwn(ENTER, e.target.id)) return
  let action = ENTER[e.target.id]
  if (e.target.id === 'password') {
    action = ui.status?.wallet.state === 'locked' && !ui.sheet ? 'unlock' : ui.sheet === 'reveal' ? 'reveal-seed' : null
  }
  if (!action) return
  e.preventDefault()
  document.querySelector(`[data-action="${action}"]`)?.click()
})

// -------------------------------------------------------------------- start

function boot () {
  window.pomona.on('change', refresh)
  window.pomona.on('error', (m) => toast(m, true))
  window.pomona.on('update', (u) => { ui.update = u; render() })
  refresh()
}

render()
if (window.pomona) boot()
else window.addEventListener('pomona:backend', boot, { once: true })
