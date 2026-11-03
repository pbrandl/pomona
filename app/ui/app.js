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
import { esc, short, fmt, isoDay, endOfDay, num } from './format.js'
import { PEAR } from './views/parts.js'
import { onboarding, locked, createWalletSheet, restoreSheet, revealSheet, seedSheet } from './views/onboarding.js'
import { start, createPage, joinPage, createStepError } from './views/start.js'
import { round, newsPage, invitePage } from './views/round.js'
import { ICON } from './views/icons.js'
import { Idiomorph } from './vendor/idiomorph.esm.js'
import { walletSheet } from './views/wallet.js'
import { receiptSheet, invoiceSheet, scanSheet } from './views/receipt.js'
import { Scanner } from './scanner.js'
import { fundSheet } from './views/fund.js'
import { bidPage } from './views/bid.js'
import { payPage } from './views/pay.js'
import { assistantPage, SPARK, markNew } from './views/assistant.js'
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
  homeChat: false, // start screen: chat opened in place (hero flew out)
  homeChatFresh: false,
  joinScan: false, // "Einer Runde beitreten": camera open for the invite QR
  showAllInvoices: false,
  showAllNews: false,
  quote: null, // quoteBid result while the bid confirmation is open
  bidDone: null, // { pledgeAfter, deposit } after a successful bid
  payStep: 'review', // "Rechnung bezahlen": review → done
  payIndex: null, // which invoice (0-based), null = all open ones
  payQuote: null, // quotePay result
  payDone: null, // { invoices, amount } after paying
  invoiceDetails: null, // organizer, invoice mode: who paid, who not
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
    website: '',
    target: '',
    installments: '12',
    interval: 'month',
    mode: 'invoice', // 'invoice' (pay each invoice) | 'deposit' (escrow up front)
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
  pay: (u) => (u.status?.round ? payPage(u) : ''),
  create: (u) => (u.status?.wallet.state === 'unlocked' ? createPage(u) : ''),
  join: (u) => (u.status?.wallet.state === 'unlocked' ? joinPage(u) : ''),
  assistant: (u) => (u.status?.assistant ? assistantPage(u) : ''),
  news: (u) => (u.status?.round?.role === 'organizer' ? newsPage(u) : ''),
  invite: (u) => (u.status?.round ? invitePage(u) : ''),
  wallet: (u) => (u.status?.wallet.state === 'unlocked' ? walletSheet(u) : '')
}

function topbar (nav = '') {
  const w = ui.status?.wallet
  // On the start screens the chat sits at the bottom; no second entry up here.
  const onHome = !ui.sheet && !!ui.status?.assistant && (w?.state === 'none' || (w?.state === 'unlocked' && !ui.status.round))
  // In overlays (chat, bid flow and every other page on top) the "Pomona" label
  // goes; the page's own way back takes its place, on one line with the chat
  // button and the wallet. Anything after <!--right--> goes to the right side.
  // The chat button goes inside the chat.
  const overlay = !!ui.sheet || !!ui.homeChat
  const [navLeft, navRight = ''] = nav.split('<!--right-->')
  const ask = onHome || ui.sheet === 'assistant' ? '' : `<button class="pill ask-pill" data-action="open-assistant" title="Frag Pomona">${SPARK}<span>Frag Pomona</span></button>`
  // "Frag Pomona" is there from the first start on, also before a wallet exists.
  const right = w?.state === 'unlocked'
    ? `<div class="bar-right">${navRight}${ask}<button class="pill" data-action="open-sheet" data-sheet="wallet"><span class="dot ${ui.status.peers > 0 ? 'on' : ''}" title="${ui.status.peers} Peers"></span>${fmt(w.usdt)} ${esc(w.symbol)}<span class="muted mono">${short(w.address)}</span></button></div>`
    : ui.status ? `<div class="bar-right">${navRight}${ask}</div>` : ''
  const update = ui.update
    ? `<div class="update-bar" role="status"><span>Neue Version von Pomona ist bereit.</span><button class="btn accent small" data-action="restart" ${ui.status?.busy ? 'disabled title="Nach der laufenden Transaktion"' : ''}>Neu starten</button></div>`
    : ''
  const left = overlay ? `<div class="bar-left">${navLeft}</div>` : `<button class="brand" data-action="go-home" aria-label="Pomona, zum Start">${PEAR}Pomona</button>`
  const empty = overlay && !/<button/.test(left + right)
  return `${update}${empty ? '' : `<header class="bar">${left}${right}</header>`}`
}

function body () {
  const s = ui.status
  if (!s) return '<div class="center-screen" style="align-items:center"><span class="spinner"></span></div>'
  if (s.wallet.state === 'none') return onboarding(ui) // with the chat docked below
  if (s.wallet.state === 'locked') return locked(ui)
  return s.round ? round(ui) : start(ui)
}

/** The top row of a page (views/parts.js page()): its way back, nothing nested. */
const PAGE_TOP = /<div class="page-top">([\s\S]*?)<\/div>/

function render () {
  // Keep focus and caret across re-renders (status refreshes in the background).
  const active = document.activeElement
  const focusId = active?.id
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null

  // One step, one page: an open flow replaces the main view entirely.
  const flow = ui.sheet && SHEETS[ui.sheet] ? SHEETS[ui.sheet](ui) : ''
  const toast = ui.toast ? `<div class="toast ${ui.toast.error ? 'error' : ''}" role="status">${ui.toast.error ? ICON.alert : ICON.check}<span>${esc(ui.toast.text)}</span></div>` : ''
  markNew(chatSeen)
  const keep = document.getElementById('chat-scroll')
  const atBottom = !keep || keep.scrollHeight - keep.scrollTop - keep.clientHeight < 40
  // Morph instead of replacing: unchanged elements stay the same nodes, so the
  // field you type in keeps focus (and the phone keyboard stays open).
  // Overlays: the page's top row (its way back) moves up into the bar.
  let view = flow || body()
  let nav = ''
  const top = ui.sheet || ui.homeChat ? view.match(PAGE_TOP) : null
  if (top) { nav = top[1].trim(); view = view.replace(PAGE_TOP, '') }
  Idiomorph.morph($app, topbar(nav) + `<main>${view}</main>` + toast, { morphStyle: 'innerHTML' })
  chatSeen = ui.chat.length
  fitToScreen()
  const box = document.getElementById('chat-scroll')
  if (box && atBottom) box.scrollTop = box.scrollHeight
  focusTrack()
  const where = ui.sheet + ':' + ui.createStep + ':' + ui.bidStep
  if (where !== lastPage) { lastPage = where; window.scrollTo(0, 0) }

  // Bid step "Betrag" on desktop: the field is focused right away, caret blinking.
  if (!focusId && ui.sheet === 'bid' && ui.bidStep === 'amount') {
    const input = document.getElementById('amount')
    if (input) { input.focus(); const n = input.value.length; try { input.setSelectionRange(n, n) } catch {} }
  }
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

/**
 * Keeps the newest message in view. The chat page scrolls its own message
 * area (instantly on open, smoothly for new messages); the start screen
 * scrolls the window.
 */
function scrollChat (smooth = false) {
  window.requestAnimationFrame(() => {
    const box = document.getElementById('chat-scroll')
    const behavior = smooth ? 'smooth' : 'auto'
    if (box) box.scrollTo({ top: box.scrollHeight, behavior })
    else window.scrollTo({ top: document.body.scrollHeight, behavior })
  })
}
let chatSeen = 0 // messages already shown; newer ones glide in once

/**
 * Chat views fill exactly the rest of the screen below their top edge, so the
 * window itself never scrolls (only the message area does).
 */
function fitToScreen () {
  const vv = window.visualViewport
  // The page may already keep the home-bar inset itself (the artifact frame
  // does): remember it, so the chat field does not add the same space again.
  const root = document.documentElement
  if (!root.classList.contains('kb-open')) {
    root.style.setProperty('--root-inset', (parseFloat(window.getComputedStyle(root).paddingBottom) || 0) + 'px')
  }
  // Keyboard open: the field sits right on it, no room for the home-bar inset.
  // Detected by the visual viewport, or (inside frames, where that does not
  // change) by a focused text field on a touch screen.
  const typing = window.matchMedia?.('(pointer: coarse)').matches && document.activeElement?.matches?.('input:not([type=checkbox]):not([type=radio]), textarea')
  document.documentElement.classList.toggle('kb-open', !!typing || (!!vv && vv.height < window.innerHeight - 80))
  // Start screen before chatting: exactly one screen high, field at the bottom.
  const home = $app.querySelector('.home:not(.chatting)')
  if (home) {
    const top = home.getBoundingClientRect().top + window.scrollY
    const inset = parseFloat(window.getComputedStyle(root).paddingBottom) || 0
    home.style.minHeight = `calc(100dvh - ${Math.ceil(top + inset)}px)`
  }
  const el = $app.querySelector('.chat-page, .home.chatting')
  if (!el) return
  // Field and example questions float over the messages: the last message
  // stops just above them (CSS --dock-h).
  const dock = el.querySelector('.home-dock, .chat-foot')
  if (dock) el.style.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`)
  // With the phone keyboard open, only the visual viewport is visible: size the
  // chat to it and keep the page at the top, so head, field and back link stay
  // reachable (iOS would otherwise push the page up under the keyboard).
  if (vv && vv.height < window.innerHeight - 1) {
    if (window.scrollY) window.scrollTo(0, 0)
    const top = el.getBoundingClientRect().top
    el.style.height = `${Math.floor(vv.height - top)}px`
    return
  }
  const top = el.getBoundingClientRect().top + window.scrollY
  // The page itself may keep a bottom inset (e.g. the iPhone home bar).
  const inset = parseFloat(window.getComputedStyle(document.documentElement).paddingBottom) || 0
  el.style.height = `calc(100dvh - ${Math.ceil(top + inset)}px)`
}
window.addEventListener('resize', fitToScreen)
window.visualViewport?.addEventListener('resize', () => { fitToScreen(); scrollChat() })
window.visualViewport?.addEventListener('scroll', () => { if ($app.querySelector('.chat-page, .home.chatting')) fitToScreen() })

/** Camera scanner, alive only while the scan page is open. */
let scanner = null
function stopScanner () {
  scanner?.stop()
  scanner = null
}
/**
 * @param {'receipt'|'invite'} [kind] - receipts (organizer checks) or invite
 *   QR codes (joining a round). Each only accepts its own kind of code.
 */
async function startScanner (kind = 'receipt') {
  stopScanner()
  ui.scanError = null
  if (kind === 'invite') {
    scanner = new Scanner(async (code) => {
      scanner = null
      ui.joinScan = false
      ui.draft.link = code
      render()
      try { await actions.join() } catch (e) { toast(e.message, true) }
      render()
    }, (c) => c.startsWith('pomona://'))
  } else {
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
  }
  try {
    await scanner.start()
  } catch (e) {
    scanner = null
    ui.scanError = e.message
  }
}

/**
 * Bid step "Betrag": the keyboard feeds the keypad on desktop
 * (digits, comma or dot, Backspace, Enter).
 */
document.addEventListener('keydown', (e) => {
  if (ui.sheet !== 'bid' || ui.bidStep !== 'amount' || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target?.closest?.('input, textarea, select')) return
  let k = null
  if (/^[0-9]$/.test(e.key)) k = e.key
  else if (e.key === ',' || e.key === '.') k = ','
  else if (e.key === 'Backspace' || e.key === 'Delete') k = 'del'
  else if (e.key === 'Enter') {
    e.preventDefault()
    $app.querySelector('[data-action="review-bid"]:not([disabled])')?.click()
    return
  }
  if (!k) return
  e.preventDefault()
  actions.key({ dataset: { key: k } })
  render()
})

/**
 * Wide rounds scroll the timeline sideways: start at the current installment,
 * then keep the person's own scroll position across re-renders.
 */
let trackKey = null
let trackLeft = 0
function focusTrack () {
  const el = $app.querySelector('[data-track]')
  if (!el) return
  const key = ui.status?.round?.address + ':' + ui.status?.round?.invoiceCount
  if (key !== trackKey) {
    // Start with the last settled installment exactly on the headline's left edge
    // (column offsets are relative to the line, which starts at the card padding).
    const cols = [...el.querySelectorAll('.tk-col')]
    const next = cols.findIndex((c) => !c.classList.contains('done'))
    const anchor = cols[Math.max(0, (next === -1 ? cols.length : next) - 1)]
    trackLeft = anchor ? anchor.offsetLeft : 0
    trackKey = key
  }
  el.scrollLeft = trackLeft
  // Scroll indicator on the card's bottom edge instead of the native scrollbar.
  const bar = $app.querySelector('[data-track-bar]')
  const thumb = bar?.firstElementChild
  const paint = () => {
    if (!bar) return
    const ratio = el.clientWidth / el.scrollWidth
    bar.hidden = ratio >= 0.999
    thumb.style.width = ratio * 100 + '%'
    thumb.style.left = (el.scrollLeft / el.scrollWidth) * 100 + '%'
  }
  paint()
  el.addEventListener('scroll', () => { trackLeft = el.scrollLeft; paint() }, { passive: true })
  // The whole card scrolls the timeline: sideways wheel/trackpad (or Shift +
  // wheel) and dragging with finger or mouse. Vertical scrolling stays the page's.
  const card = el.closest('.tk-card')
  card?.addEventListener('wheel', (e) => {
    if (el.contains(e.target)) return // the timeline scrolls natively
    const dx = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX
    if (!dx || (!e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY))) return
    el.style.scrollBehavior = 'auto'
    el.scrollLeft += dx
    e.preventDefault()
  }, { passive: false })
  card?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || bar?.contains(e.target) || e.target.closest('button, a, [data-action]')) return
    const x0 = e.clientX
    const left0 = el.scrollLeft
    let dragging = false
    const move = (ev) => {
      const dx = ev.clientX - x0
      if (!dragging && Math.abs(dx) < 6) return // a tap stays a tap
      dragging = true
      el.style.scrollBehavior = 'auto'
      el.scrollLeft = left0 - dx
    }
    const up = () => { card.removeEventListener('pointermove', move); el.style.scrollBehavior = '' }
    card.addEventListener('pointermove', move)
    card.addEventListener('pointerup', up, { once: true })
    card.addEventListener('pointercancel', up, { once: true })
  })
  // Drag or tap the indicator (mouse users have no swipe).
  bar?.addEventListener('pointerdown', (e) => {
    const move = (ev) => {
      const r = bar.getBoundingClientRect()
      el.scrollLeft = ((ev.clientX - r.left) / r.width) * el.scrollWidth - el.clientWidth / 2
    }
    move(e)
    bar.setPointerCapture(e.pointerId)
    bar.onpointermove = move
    bar.onpointerup = () => { bar.onpointermove = null }
  })
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
    if (s.round && !ui.invite) ui.invite = await call('invite')
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
  mode: (el) => { ui.draft.mode = el.dataset.mode },
  'open-sheet': (el) => { ui.sheet = el.dataset.sheet },
  'close-sheet': () => {
    ui.sheet = null
    ui.joinScan = false
    ui.quote = null
    ui.bidDone = null
    ui.bidStep = 'amount'
    ui.payQuote = null
    ui.payDone = null
    ui.payStep = 'review'
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
  'open-assistant': () => { ui.sheet = 'assistant'; chatSeen = ui.chat.length; setTimeout(() => scrollChat(false)) },
  'home-chat-close': () => { document.activeElement?.blur?.(); ui.homeChat = false },
  /** The logo always leads back to the start view (closes pages and the chat). */
  'go-home': () => {
    document.activeElement?.blur?.()
    ui.homeChat = false
    if (ui.sheet && !ui.status?.busy) actions['close-sheet']()
    window.scrollTo(0, 0)
  },
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
      case 'pay':
        return actions['open-pay']()
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
  /** Keypad on touch screens: whole USDT, at most 6 digits, no leading zero. */
  key: (el) => {
    const k = el.dataset.key
    let v = String(ui.draft.amount ?? '').replace(/[^\d,]/g, '')
    const [int, dec] = v.split(',')
    if (k === 'del') {
      v = v.slice(0, -1)
    } else if (k === ',') {
      if (dec === undefined) v = (int || '0') + ',' // one comma
    } else if (dec !== undefined) {
      if (dec.length < 2) v += k // cents: two digits
    } else if (int.length < 6 && !(int === '' && k === '0')) {
      v += k
    }
    ui.draft.amount = v
  },

  'show-all-invoices': () => { ui.showAllInvoices = true },
  'toggle-news': () => { ui.showAllNews = !ui.showAllNews },

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
      website: d.website || undefined,
      mode: d.mode,
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
  /** Join page: open or close the camera for the invite QR code. */
  async 'join-scan' () {
    if (ui.joinScan) { stopScanner(); ui.joinScan = false; return }
    ui.joinScan = true
    render()
    await startScanner('invite')
    if (ui.scanError) ui.joinScan = false
  },
  async join () {
    stopScanner()
    ui.joinScan = false
    await run('join', { link: ui.draft.link.trim() })
    ui.draft.link = ''
    ui.sheet = null
  },
  /** Opens the confirmation with deposit, fee and balance check. */
  async 'review-bid' () {
    if (!(num(ui.draft.amount) > 0)) throw new Error('Bitte einen Betrag eingeben.')
    ui.sheet = 'bid' // also when started from the inline field on the round page
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
  /** Invoice mode: open the pay page for one invoice (data-index) or all open ones. */
  async 'open-pay' (el) {
    ui.payIndex = el?.dataset?.index != null ? Number(el.dataset.index) : null
    ui.payQuote = null
    ui.payDone = null
    ui.payStep = 'review'
    ui.sheet = 'pay'
    render()
    ui.payQuote = await call('quotePay', ui.payIndex === null ? {} : { index: ui.payIndex })
  },
  async 'confirm-pay' () {
    const q = ui.payQuote
    await run('pay', ui.payIndex === null ? {} : { index: ui.payIndex })
    ui.payDone = { invoices: q.invoices, amount: q.amount }
    ui.payStep = 'done'
  },
  async withdraw () {
    const deposit = ui.status.round.mode !== 'invoice'
    if (!window.confirm(deposit ? 'Dein ganzes Gebot zurückziehen? Der hinterlegte Betrag geht zurück in deine Wallet.' : 'Dein Gebot zurückziehen?')) return
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
  async 'show-invoice' (el) {
    ui.invoiceIndex = Number(el.dataset.index)
    ui.invoiceDetails = null
    ui.sheet = 'invoice'
    if (ui.status.round.mode !== 'invoice') return
    render()
    ui.invoiceDetails = await call('invoiceDetails', { index: ui.invoiceIndex })
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

// Tapping "Senden" must not take the focus from the field: the keyboard stays
// open and nothing moves under the finger.
$app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-action="agent-send"]') && document.activeElement?.id === 'ask') e.preventDefault()
})

// Keyboard comes and goes with the focus on phones: refit right away.
$app.addEventListener('focusin', () => fitToScreen())
$app.addEventListener('focusout', () => setTimeout(fitToScreen, 50))

// Tap or swipe in the messages: put the keyboard away (as in messengers).
// Safari on iPhone keeps it open otherwise.
$app.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#chat-scroll') || e.target.closest('button, a, input')) return
  if (document.activeElement?.id === 'ask') document.activeElement.blur()
})
$app.addEventListener('touchmove', (e) => {
  if (e.target.closest?.('#chat-scroll') && document.activeElement?.id === 'ask') document.activeElement.blur()
}, { passive: true })

// Escape leaves the start-screen chat.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !ui.homeChat || ui.sheet) return
  document.activeElement?.blur?.()
  ui.homeChat = false
  render()
})

// Start screen: the first focus on the docked question field opens the chat in place.
$app.addEventListener('focusin', (e) => {
  if (e.target.id !== 'ask' || ui.sheet || ui.homeChat || !e.target.closest('.home')) return
  ui.homeChat = true
  ui.homeChatFresh = true
  render()
  ui.homeChatFresh = false // later renders show the final state, no replayed animation
})

const syncDraft = (e) => {
  const key = e.target.dataset?.draft
  if (key && Object.hasOwn(ui.draft, key)) ui.draft[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value
}
$app.addEventListener('input', (e) => {
  // The bid field takes only digits and one decimal separator (letters are dropped).
  if (e.target.id === 'amount') {
    const clean = e.target.value.replace(/[^\d.,]/g, '')
    if (clean !== e.target.value) e.target.value = clean
  }
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
