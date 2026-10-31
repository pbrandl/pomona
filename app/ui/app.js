// Pomona UI. Plain JS, no framework: one state object, one render function,
// event delegation via data-action. The backend (window.pomona) is either the
// Bare worker (ui/pear.js) or the in-browser mock (ui/mock.js).

const $app = document.getElementById('app')

const ui = {
  status: null,
  tab: 'create', // start screen: 'create' | 'join'
  sheet: null, // 'wallet' | 'seed' | 'restore' | null
  seed: null, // shown once after creating / on request
  invite: null, // { link, qr }
  addressQr: null,
  toast: null,
  pending: null, // action currently running in the UI
  draft: {
    title: '', description: '', target: '', days: '30', minBid: '', inviteOnly: true, network: '',
    link: '', amount: '', news: '', restore: ''
  }
}

// ------------------------------------------------------------------ helpers

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const fmt = (n, max = 2) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: max })

// Accepts "48.000", "48000", "1.234,56", "12,5" and "12.5".
function num (v) {
  v = String(v ?? '').trim().replace(/\s/g, '')
  if (v.includes(',')) return v.replace(/\./g, '').replace(',', '.')
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) return v.replace(/\./g, '')
  return v
}

const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : ''

function timeLeft (r) {
  const s = r.deadline - r.now
  if (s <= 0) return { value: '0', unit: 'beendet' }
  if (s >= 86400 * 2) return { value: String(Math.floor(s / 86400)), unit: 'Tage übrig' }
  if (s >= 3600) return { value: String(Math.floor(s / 3600)), unit: 'Std. übrig' }
  return { value: String(Math.max(1, Math.floor(s / 60))), unit: 'Min. übrig' }
}

function endDate (r) {
  return new Date(r.deadline * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

const PEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 7c-1.6 0-2.6 1.3-2.9 2.8-.3 1.6-1.1 2.3-2 3.3A5.3 5.3 0 0 0 12 21.5a5.3 5.3 0 0 0 4.9-8.4c-.9-1-1.7-1.7-2-3.3C14.6 8.3 13.6 7 12 7Z"/>
  <path d="M12 7V3.5"/><path d="M12 4.5c1.2-1.4 2.8-1.6 4-1.2-.5 1.5-2 2.4-4 2.2"/></svg>`

const spinner = '<span class="spinner"></span>'

function btn (action, label, cls = '', { disabled = false, busyLabel = null } = {}) {
  const busy = ui.pending === action
  const off = disabled || !!ui.pending || !!ui.status?.busy
  return `<button class="btn ${cls}" data-action="${action}" ${off ? 'disabled' : ''}>${busy ? spinner + ' ' + esc(busyLabel || 'Bitte warten…') : esc(label)}</button>`
}

// ----------------------------------------------------------------- screens

function topbar () {
  const s = ui.status
  const w = s?.wallet
  const right = w
    ? `<button class="pill" data-action="open-wallet"><span class="dot ${s.peers > 0 ? 'on' : ''}" title="${s.peers} Peers"></span>${fmt(w.token)} ${esc(w.symbol)}<span class="muted mono">${short(w.address)}</span></button>`
    : ''
  return `<header class="bar"><div class="brand">${PEAR}Pomona</div>${right}</header>`
}

function onboarding () {
  return `<div class="center-screen stack-lg">
    <div class="stack">
      <h1>Gemeinsam finanzieren.<br><span class="muted">Ohne Mittelsmann.</span></h1>
      <p class="lead">Pomona ist eine Bietrunde, die auf euren Rechnern läuft. Das Geld liegt bis zum Ende in einem Smart Contract: Wird das Ziel erreicht, geht es an das Projekt, sonst zurück an alle.</p>
    </div>
    <div class="row" style="justify-content:flex-start">
      ${btn('create-wallet', 'Wallet erstellen', 'accent', { busyLabel: 'Wird erstellt…' })}
      <button class="btn ghost" data-action="open-restore" ${ui.pending ? 'disabled' : ''}>Wiederherstellen</button>
    </div>
  </div>`
}

function start () {
  const s = ui.status
  const d = ui.draft
  const tabs = `<div class="tabs">
    <button class="${ui.tab === 'create' ? 'on' : ''}" data-action="tab" data-tab="create">Runde starten</button>
    <button class="${ui.tab === 'join' ? 'on' : ''}" data-action="tab" data-tab="join">Beitreten</button>
  </div>`

  const net = d.network || s.network.id
  const networks = s.networks.map((n) =>
    `<option value="${esc(n.id)}" ${n.id === net ? 'selected' : ''} ${n.ready ? '' : 'disabled'}>${esc(n.name)}${n.ready ? '' : ' (nicht eingerichtet)'}</option>`).join('')

  const create = `<div class="card stack">
    <div><label for="title">Name der Runde</label><input class="field" id="title" data-draft="title" placeholder="Solawi Lindenhof 2027" value="${esc(d.title)}"></div>
    <div><label for="description">Worum geht es?</label><textarea class="field" id="description" data-draft="description" placeholder="Gemüse für 40 Haushalte, April bis März.">${esc(d.description)}</textarea></div>
    <div class="grid2">
      <div><label for="target">Zielbetrag (USDT)</label><input class="field" id="target" data-draft="target" inputmode="decimal" placeholder="48.000" value="${esc(d.target)}"></div>
      <div><label for="days">Laufzeit (Tage)</label><input class="field" id="days" data-draft="days" inputmode="numeric" value="${esc(d.days)}"></div>
    </div>
    <div class="grid2">
      <div><label for="minBid">Mindestgebot (optional)</label><input class="field" id="minBid" data-draft="minBid" inputmode="decimal" placeholder="0" value="${esc(d.minBid)}"></div>
      <div><label for="network">Netzwerk</label><select class="field" id="network" data-draft="network">${networks}</select></div>
    </div>
    <label class="switch"><input type="checkbox" data-draft="inviteOnly" ${d.inviteOnly ? 'checked' : ''}> Nur mit Einladungslink bieten</label>
    ${btn('create-round', 'Runde starten', 'accent block', { busyLabel: 'Contract wird angelegt…' })}
  </div>`

  const join = `<div class="card stack">
    <div><label for="link">Einladungslink</label><textarea class="field mono" id="link" data-draft="link" placeholder="pomona://…">${esc(d.link)}</textarea></div>
    ${btn('join', 'Beitreten', 'accent block', { busyLabel: 'Suche Peers…' })}
    <p class="small muted">Die Runde wird direkt von anderen Teilnehmern geladen, ohne Server.</p>
  </div>`

  return `<div class="stack-lg">
    <div class="stack"><h1>Eine Runde, ein Ziel.</h1><p class="lead">Starte eine Bietrunde für dein Projekt oder tritt einer bei.</p></div>
    <div class="stack">${tabs}${ui.tab === 'create' ? create : join}</div>
  </div>`
}

function ring (r) {
  const R = 100
  const C = 2 * Math.PI * R
  const p = Math.min(1, r.progress)
  return `<div class="ring">
    <svg viewBox="0 0 220 220"><circle class="track" cx="110" cy="110" r="${R}"/><circle class="value" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/></svg>
    <div class="center"><div class="big">${fmt(r.progress * 100, 0)}%</div><div class="of">${fmt(r.total)} von ${fmt(r.target)} ${esc(r.symbol)}</div></div>
  </div>`
}

function stateBadge (r) {
  if (r.state === 'open') return `<span class="badge">Offen bis ${esc(endDate(r))}</span>`
  if (r.claimed) return '<span class="badge">Ausgezahlt</span>'
  if (r.state === 'succeeded') return '<span class="badge">Ziel erreicht</span>'
  return '<span class="badge warn">Ziel verfehlt</span>'
}

function bidCard (r) {
  const has = Number(r.myPledge) > 0
  if (r.state === 'open') {
    return `<div class="card stack">
      ${has ? `<div class="mine"><span class="muted">Dein Gebot</span><strong>${fmt(r.myPledge)} ${esc(r.symbol)}</strong></div>` : ''}
      <div class="amount">
        <input id="amount" data-draft="amount" inputmode="decimal" placeholder="${has ? 'Erhöhen um' : 'Dein Gebot'}" value="${esc(ui.draft.amount)}">
        <span class="unit">${esc(r.symbol)}</span>
        ${btn('bid', has ? 'Erhöhen' : 'Bieten', 'accent', { busyLabel: 'Wird bestätigt…' })}
      </div>
      <div class="row small">
        <span class="muted">${Number(r.minBid) > 0 ? 'Mindestgebot ' + fmt(r.minBid) + ' ' + esc(r.symbol) : 'Kein Mindestgebot'}</span>
        ${has ? `<button class="link" data-action="withdraw" ${ui.pending ? 'disabled' : ''}>${ui.pending === 'withdraw' ? 'Wird zurückgezogen…' : 'Gebot zurückziehen'}</button>` : ''}
      </div>
    </div>`
  }
  if (r.state === 'failed' && has) {
    return `<div class="card stack"><div class="mine"><span class="muted">Dein Gebot</span><strong>${fmt(r.myPledge)} ${esc(r.symbol)}</strong></div>
      <p class="muted small">Das Ziel wurde nicht erreicht. Hol dir deinen Betrag aus dem Contract zurück.</p>
      ${btn('refund', 'Betrag zurückholen', 'accent block', { busyLabel: 'Wird überwiesen…' })}</div>`
  }
  if (r.state === 'succeeded' && has) {
    return `<div class="card"><div class="mine"><span class="muted">Dein Beitrag</span><strong>${fmt(r.myPledge)} ${esc(r.symbol)}</strong></div><p class="muted small" style="margin-top:8px">Danke! Die Runde hat ihr Ziel erreicht.</p></div>`
  }
  return ''
}

function organizerCard (r) {
  if (r.role !== 'organizer') return ''
  let main = ''
  if (r.state === 'succeeded' && !r.claimed) {
    main = `<p class="muted small">Das Ziel ist erreicht. Der Betrag liegt im Contract bereit.</p>${btn('claim', fmt(r.total) + ' ' + r.symbol + ' auszahlen', 'accent block', { busyLabel: 'Wird ausgezahlt…' })}`
  } else if (r.state === 'open') {
    const inv = ui.invite
    main = `<div class="share">
      <div class="qr">${inv ? inv.qr : ''}</div>
      <div class="stack" style="min-width:0">
        <p class="small muted">${r.inviteOnly ? 'Nur wer diesen Link hat, kann bieten.' : 'Jeder mit dem Link kann bieten.'}</p>
        <div class="linkbox">${esc(inv?.link || '')}</div>
        <button class="btn ghost small" data-action="copy-invite">Link kopieren</button>
      </div>
    </div>`
  }
  const news = `<div class="amount" style="margin-top:16px">
      <input id="news" data-draft="news" placeholder="Neuigkeit an alle…" value="${esc(ui.draft.news)}">
      ${btn('post-news', 'Senden', 'ghost small')}
    </div>`
  const cancel = r.state === 'open'
    ? `<div class="row small" style="margin-top:12px"><span></span><button class="link danger" data-action="cancel" ${ui.pending ? 'disabled' : ''}>Runde abbrechen</button></div>`
    : ''
  return main || r.state === 'open' ? `<div class="card"><h2>Organisation</h2>${main}${news}${cancel}</div>` : `<div class="card"><h2>Organisation</h2>${news}</div>`
}

function newsCard (r) {
  if (!r.news.length) return ''
  const items = r.news.map((n) => `<div class="news-item"><time>${new Date(n.at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</time>${esc(n.text)}</div>`).join('')
  return `<div class="card"><h2>Neuigkeiten</h2>${items}</div>`
}

function round () {
  const r = ui.status.round
  const t = timeLeft(r)
  return `<div class="stack-lg">
    <div class="hero stack">
      ${stateBadge(r)}
      <h1>${esc(r.title)}</h1>
      ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
      ${!r.verified ? '<span class="badge warn">Angaben passen nicht zum Contract</span>' : ''}
      ${ring(r)}
    </div>
    <div class="card stats">
      <div><strong>${r.bidders}</strong><span>${r.bidders === 1 ? 'Bieter' : 'Bietende'}</span></div>
      <div><strong>${t.value}</strong><span>${t.unit}</span></div>
      <div><strong>${fmt(Math.max(0, Number(r.target) - Number(r.total)))}</strong><span>fehlen noch</span></div>
    </div>
    ${bidCard(r)}
    ${organizerCard(r)}
    ${newsCard(r)}
    <p class="small muted" style="text-align:center">Contract <span class="mono">${short(r.address)}</span> · ${esc(ui.status.network.name)}</p>
  </div>`
}

function walletSheet () {
  const s = ui.status
  const w = s.wallet
  return `<div class="sheet-backdrop" data-action="close-sheet"><aside class="sheet stack-lg" data-stop>
    <div class="row"><h2 style="margin:0">Wallet</h2><button class="link" data-action="close-sheet">Schließen</button></div>
    <div class="stack">
      <div class="mine"><span class="muted">Guthaben</span><strong>${fmt(w.token)} ${esc(w.symbol)}</strong></div>
      <div class="mine small"><span class="muted">Für Gebühren</span><span>${fmt(w.native, 5)} ${esc(s.network.native)}</span></div>
    </div>
    <div class="stack">
      <div class="qr" style="width:160px;height:160px">${ui.addressQr || ''}</div>
      <div class="mono" style="word-break:break-all">${esc(w.address)}</div>
      <button class="btn ghost small" data-action="copy-address">Adresse kopieren</button>
    </div>
    ${s.network.dev ? `<div class="stack"><p class="small muted">Lokale Test-Chain: hol dir Test-ETH und 5.000 Test-USDT.</p>${btn('faucet', 'Testguthaben holen', 'ghost block', { busyLabel: 'Wird überwiesen…' })}</div>` : ''}
    <hr class="divider">
    <div class="stack">
      <p class="small muted">Deine Wallet läuft nur auf diesem Gerät (WDK von Tether). Ohne Wiederherstellungsphrase ist sie bei Verlust weg.</p>
      <button class="link" data-action="show-seed">Wiederherstellungsphrase anzeigen</button>
    </div>
    <p class="small muted">${s.peers} ${s.peers === 1 ? 'Peer' : 'Peers'} verbunden · ${esc(s.network.name)}</p>
  </aside></div>`
}

function seedSheet () {
  const words = (ui.seed || '').split(' ').map((w) => `<span>${esc(w)}</span>`).join('')
  return `<div class="sheet-backdrop"><aside class="sheet stack-lg" data-stop>
    <div class="stack"><h1 style="font-size:24px">Deine Wiederherstellungsphrase</h1>
    <p class="muted">Schreib diese 12 Wörter auf Papier und bewahre sie sicher auf. Wer sie kennt, hat Zugriff auf dein Geld.</p></div>
    <div class="seed">${words}</div>
    <button class="btn accent block" data-action="seed-done">Ich habe sie notiert</button>
  </aside></div>`
}

function restoreSheet () {
  return `<div class="sheet-backdrop" data-action="close-sheet"><aside class="sheet stack-lg" data-stop>
    <div class="row"><h2 style="margin:0">Wallet wiederherstellen</h2><button class="link" data-action="close-sheet">Abbrechen</button></div>
    <div><label for="restore">12 oder 24 Wörter</label><textarea class="field" id="restore" data-draft="restore" style="height:120px">${esc(ui.draft.restore)}</textarea></div>
    ${btn('restore', 'Wiederherstellen', 'accent block', { busyLabel: 'Wird geprüft…' })}
  </aside></div>`
}

// ------------------------------------------------------------------ render

function render () {
  const s = ui.status
  // Keep focus and caret across re-renders (the status refreshes in the background).
  const active = document.activeElement
  const focusId = active?.id
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null
  const scroll = document.querySelector('.sheet')?.scrollTop

  let body = '<div class="center-screen" style="align-items:center"><span class="spinner"></span></div>'
  if (s) body = !s.wallet ? onboarding() : s.round ? round() : start()

  let sheet = ''
  if (ui.sheet === 'seed') sheet = seedSheet()
  else if (ui.sheet === 'restore') sheet = restoreSheet()
  else if (ui.sheet === 'wallet' && s?.wallet) sheet = walletSheet()

  const toast = ui.toast ? `<div class="toast ${ui.toast.error ? 'error' : ''}">${esc(ui.toast.text)}</div>` : ''
  $app.innerHTML = topbar() + `<main>${body}</main>` + sheet + toast

  if (focusId) {
    const el = document.getElementById(focusId)
    if (el) {
      el.focus()
      if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]) } catch {}
    }
  }
  if (scroll) { const sh = document.querySelector('.sheet'); if (sh) sh.scrollTop = scroll }
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
    ui.status = await window.pomona.call('status')
    if (ui.status.round?.role === 'organizer' && !ui.invite) ui.invite = await window.pomona.call('invite')
    if (ui.status.wallet && !ui.addressQr) ui.addressQr = await window.pomona.call('qr', { text: ui.status.wallet.address })
  } catch (e) {
    toast(e.message, true)
  }
  render()
}

// ----------------------------------------------------------------- actions

const actions = {
  tab: (el) => { ui.tab = el.dataset.tab },
  'open-wallet': () => { ui.sheet = 'wallet' },
  'open-restore': () => { ui.sheet = 'restore' },
  'close-sheet': () => { ui.sheet = null },
  'seed-done': () => { ui.seed = null; ui.sheet = null },

  async 'create-wallet' () {
    await call('createWallet')
    ui.seed = await window.pomona.call('revealSeed')
    ui.sheet = 'seed'
  },
  async restore () {
    await call('restoreWallet', { seed: ui.draft.restore })
    ui.draft.restore = ''
    ui.sheet = null
    toast('Wallet wiederhergestellt')
  },
  async 'show-seed' () {
    ui.seed = await window.pomona.call('revealSeed')
    ui.sheet = 'seed'
  },
  async faucet () {
    await call('faucet')
    toast('Testguthaben ist da')
  },
  async 'create-round' () {
    const d = ui.draft
    await call('createRound', {
      title: d.title, description: d.description, target: num(d.target), days: d.days,
      minBid: num(d.minBid) || '0', inviteOnly: d.inviteOnly, network: d.network || ui.status.network.id
    })
    ui.invite = await window.pomona.call('invite')
    toast('Runde gestartet. Teile jetzt den Link.')
  },
  async join () {
    await call('join', { link: ui.draft.link })
    ui.draft.link = ''
  },
  async bid () {
    await call('bid', { amount: num(ui.draft.amount) })
    ui.draft.amount = ''
    toast('Gebot ist im Contract')
  },
  async withdraw () {
    if (!confirm('Dein ganzes Gebot zurückziehen?')) return
    await call('withdraw', { amount: 'all' })
    toast('Gebot zurückgezogen')
  },
  async claim () {
    await call('claim')
    toast('Ausgezahlt')
  },
  async refund () {
    await call('refund')
    toast('Betrag ist zurück in deiner Wallet')
  },
  async cancel () {
    if (!confirm('Runde wirklich abbrechen? Alle Bietenden bekommen ihr Geld zurück.')) return
    await call('cancel')
  },
  async 'post-news' () {
    await call('postNews', { text: ui.draft.news })
    ui.draft.news = ''
  },
  async 'copy-invite' () {
    await window.pomona.copy(ui.invite.link)
    toast('Link kopiert')
  },
  async 'copy-address' () {
    await window.pomona.copy(ui.status.wallet.address)
    toast('Adresse kopiert')
  }
}

async function call (method, params) {
  await window.pomona.call(method, params)
  await refresh()
}

$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]')
  if (!el || el.disabled) return
  // Clicks inside a sheet must not close it via the backdrop.
  if (el.classList.contains('sheet-backdrop') && e.target.closest('[data-stop]')) return
  const name = el.dataset.action
  const fn = actions[name]
  if (!fn) return
  ui.pending = name
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

$app.addEventListener('input', (e) => {
  const key = e.target.dataset?.draft
  if (!key) return
  ui.draft[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value
})
$app.addEventListener('change', (e) => {
  const key = e.target.dataset?.draft
  if (key) ui.draft[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value
})
$app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey) return
  const map = { amount: 'bid', news: 'post-news' }
  const action = map[e.target.id]
  if (action) document.querySelector(`[data-action="${action}"]`)?.click()
})

// ------------------------------------------------------------------- start

function boot () {
  window.pomona.on('change', refresh)
  window.pomona.on('error', (m) => toast(m, true))
  refresh()
}

render()
if (window.pomona) boot()
else window.addEventListener('pomona:backend', boot, { once: true })
