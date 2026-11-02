/**
 * The round on one page, lean:
 *
 *   header    phase · deadline, title with QR and share icons, description
 *   progress  ring in the middle, bidders · average · median below
 *   you       your situation and the single next action (views/you.js)
 *   track     the installments as dots on a line: received above, outstanding
 *             below, paid ones ticked. Tap a dot for receipt, payment or details.
 *   news      newest message, the rest folded
 *   manage    organizer tools as quiet links
 *
 * @module ui/views/round
 */
import { esc, fmt, num, per, shortDate, dateTime, short } from '../format.js'
import { link, sheet } from './parts.js'
import { youCard } from './you.js'
import { ICON } from './icons.js'

export function round (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  return `<div class="stack-lg">
    ${header(r)}
    ${progress(r, p)}
    ${youCard(ui)}
    ${track(ui, r, p)}
    ${news(ui, r)}
    ${manage(ui, r)}
    <p class="small muted" style="text-align:center">${r.mode === 'invoice' ? 'Runde' : 'Treuhandkonto'} <span class="mono">${short(r.address)}</span> · ${esc(ui.status.network.name)} · <span class="live"><span class="dot on"></span>live</span></p>
  </div>`
}

// ------------------------------------------------------------------- header

/** Unix seconds → "29.11.2026, 12:00" */
const deadline = (t) => new Date(t * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function header (r) {
  const eyebrow = {
    bidding: `Bietphase · bis ${deadline(r.biddingEnd)}`,
    running: r.mode === 'invoice' ? `Ratenzahlung · Rechnung ${r.invoiceCount} von ${r.installments}` : `Ratenzahlung · ${r.invoiceCount} von ${r.installments} abgerechnet`,
    completed: 'Abgeschlossen',
    failed: 'Ziel nicht erreicht'
  }[r.phase]
  // The website comes from the (sanitized) manifest: http(s) only, opens outside.
  const web = r.website
    ? `<a class="icon-btn" href="${esc(r.website)}" target="_blank" rel="noopener noreferrer" title="Website des Projekts" aria-label="Website des Projekts">${ICON.web}</a>`
    : ''
  // Everyone can invite while bidding is open; afterwards nobody can join.
  // One button: the invite page shows the QR code and "Link kopieren".
  const invite = r.phase === 'bidding'
    ? `<button class="icon-btn" data-action="open-sheet" data-sheet="invite" title="Einladen" aria-label="Einladen: QR-Code oder Link">${ICON.share}</button>`
    : ''
  const share = web || invite ? `<div class="head-actions">${web}${invite}</div>` : ''
  return `<div class="round-head">
    <p class="eyebrow ${r.phase}">${esc(eyebrow)}</p>
    <div class="title-row"><h1 class="one-line" title="${esc(r.title)}">${esc(r.title)}</h1>${share}</div>
    ${!r.verified ? '<p class="warn-text small">Die Angaben des Organisators passen nicht zum Treuhandkonto. Vorsicht.</p>' : ''}
  </div>`
}

// ----------------------------------------------------------------- progress

function ringSvg (value) {
  const R = 103 // stroke 13 reaches the edge of the 220 viewBox
  const C = 2 * Math.PI * R
  const v = Math.max(0, Math.min(1, value))
  return `<svg viewBox="0 0 220 220"><circle class="track" cx="110" cy="110" r="${R}"/><circle class="value" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v)}"/></svg>`
}

function progress (r, p) {
  const sym = esc(r.symbol)
  const center = `<div class="big">${fmt(r.progress * 100, 0)}%</div><div class="of">vom Ziel</div>`
  const stat = (value, label, cls = '') => `<div class="stat ${cls}"><strong>${value}</strong><span>${label}</span></div>`
  return `<div class="progress split">
    <div class="ring">${ringSvg(r.progress)}<div class="center">${center}</div></div>
    <div class="stats">
      ${stat(`${fmt(r.total, 0)} <small>/ ${fmt(r.target, 0)} ${sym}</small>`, `zugesagt ${p.per}`, 'key')}
      ${stat(fmt(r.bidders), r.bidders === 1 ? 'Bietende Person' : 'Bietende')}
      ${stat(r.average ? `${fmt(r.average, 0)} <small>${sym}</small>` : '–', 'Durchschnitt')}
      ${stat(r.median ? `${fmt(r.median, 0)} <small>${sym}</small>` : '–', 'Median')}
    </div>
  </div>`
}

// -------------------------------------------------------------------- track

/**
 * One column per installment. What is "received" and "outstanding" depends on
 * who looks: the organizer sees the round's money, a bidder their own.
 */
function column (r, x, organizer) {
  const payg = r.mode === 'invoice'
  let got = 0
  let due = 0
  let dot = 'todo'
  if (x.status === 'paid') { got = num(x.amount); dot = 'done' }
  if (x.status === 'issued') {
    got = num(x.paidSum)
    due = Math.max(0, num(x.amount) - got)
    dot = x.paidCount >= r.bidders ? 'done' : 'part'
  }
  if (x.status === 'open' || x.status === 'due') { due = num(x.amount); dot = 'now' }
  if (x.status === 'scheduled') due = num(x.amount)
  if (x.status === 'void') dot = 'void'

  let action = null
  if (x.status === 'paid' && (organizer || x.mine)) action = organizer ? 'show-invoice' : 'show-receipt'
  else if (x.status === 'open') action = 'open-pay'
  else if (x.status === 'issued' && organizer) action = 'show-invoice'
  else if (x.status === 'due' && organizer) action = 'invoice'

  const label = `${payg ? 'Rechnung' : 'Rate'} ${x.index + 1}, ${shortDate(x.dueAt)}`
  const attrs = action ? ` data-action="${action}" data-index="${x.index}" role="button" tabindex="0" aria-label="${esc(label)}"` : ` aria-label="${esc(label)}"`
  return {
    got,
    due,
    html: `<div class="tk-col ${dot}${action ? ' clickable' : ''}"${attrs}>
      <span class="tk-pad" aria-hidden="true"></span>
      <span class="tk-top">${got ? fmt(got) : ''}</span>
      <span class="tk-dot">${dot === 'done' ? ICON.check : ''}</span>
      <span class="tk-bottom">${due ? fmt(due) : ''}</span>
      <span class="tk-date">${esc(shortDate(x.dueAt))}</span>
    </div>`
  }
}

function track (ui, r, p) {
  if (r.phase === 'failed' || !r.invoices?.length) return ''
  const organizer = r.role === 'organizer'
  const mine = r.invoices.some((x) => x.mine)
  const cols = r.invoices.map((x) => column(r, x, organizer))
  const got = cols.reduce((s, c) => s + c.got, 0)
  const due = cols.reduce((s, c) => s + c.due, 0)
  const sym = esc(r.symbol)

  const words = organizer
    ? { top: 'erhalten', bottom: 'ausstehend' }
    : mine
      ? { top: 'bezahlt', bottom: r.mode === 'invoice' ? 'zu zahlen' : 'ausstehend' }
      : { top: 'erhalten', bottom: 'geplant' }
  const paid = r.invoices.filter((x) => x.status === 'paid').length
  const title = organizer || !mine
    ? `${r.installments} ${r.mode === 'invoice' ? 'Rechnungen' : 'Raten'}, ${esc(p.adj)}`
    : `Deine Raten, ${esc(p.adj)}`
  const summary = mine && !organizer ? `${paid} von ${r.installments} bezahlt` : `${fmt(got)} ${sym} erhalten`

  return `<div class="card tk-card">
    <div class="row tk-head"><h2>${title}</h2><span class="small muted">${summary}</span></div>
    <p class="tk-cap small"><i class="sw done"></i>${words.top} · ${fmt(got)} ${sym}</p>
    <div class="tk-scroll" data-track>
      <div class="tk-line" style="--n:${cols.length}">${cols.map((c) => c.html).join('')}</div>
    </div>
    <p class="tk-cap small"><i class="sw todo"></i>${words.bottom} · ${fmt(due)} ${sym}</p>
    <div class="tk-bar" data-track-bar aria-hidden="true"><i></i></div>
  </div>`
}

// --------------------------------------------------------------------- news

function news (ui, r) {
  if (!r.news.length) return ''
  const [latest, ...older] = r.news
  const item = (n) => `<div class="news-item"><time>${esc(dateTime(n.at))}</time>${esc(n.text)}</div>`
  const open = ui.showAllNews
  return `<div class="card news">
    <button class="news-head" data-action="toggle-news" aria-expanded="${open}" ${older.length ? '' : 'disabled'}>
      <h2>Neuigkeiten</h2>
      ${older.length ? `<span class="small muted">${open ? 'Weniger' : `${older.length} ältere`}<span class="chev ${open ? 'up' : ''}" aria-hidden="true">›</span></span>` : ''}
    </button>
    ${item(latest)}
    ${open ? older.map(item).join('') : ''}
  </div>`
}

// ------------------------------------------------------------------- manage

function manage (ui, r) {
  if (r.role !== 'organizer') return ''
  const rows = ['<button class="manage-row" data-action="open-sheet" data-sheet="news">Neuigkeit an alle schreiben<span class="chev">›</span></button>']
  if (r.invoiceCount > 0) rows.push('<button class="manage-row" data-action="open-scan">Beleg prüfen<span class="chev">›</span></button>')
  const danger = r.phase === 'bidding'
    ? link(ui, 'cancel', 'Runde abbrechen', 'danger')
    : r.phase === 'running' ? link(ui, 'terminate', 'Ratenzahlung vorzeitig beenden', 'danger') : ''
  return `<div class="card manage">
    <h2>Verwalten</h2>
    ${rows.join('')}
    ${danger ? `<div class="manage-danger">${danger}</div>` : ''}
  </div>`
}

/** Page: the invite as a QR code, to show on a phone or print out. */
export function invitePage (ui) {
  const r = ui.status.round
  const inv = ui.invite
  return sheet('Einladen', `
    <div class="invite-qr">
      <div class="qr">${inv ? inv.qr : ''}</div>
      <strong>${esc(r.title)}</strong>
      <span class="small muted">${r.inviteOnly ? 'Nur wer diesen Code oder Link hat, kann bieten.' : 'Jeder mit dem Link kann bieten.'}</span>
    </div>
    <button class="btn accent block" data-action="copy-invite">${ICON.share}<span>Link kopieren</span></button>`)
}

/** Page: write a news message (one step, one page). */
export function newsPage (ui) {
  return `<section class="page">
    <div class="page-top"><button class="link back" data-action="close-sheet">← Zurück</button></div>
    <h1 class="page-title">Neuigkeit an alle</h1>
    <div class="stack-lg">
      <p class="lead">Alle Bietenden sehen sie in der Runde und bekommen eine Benachrichtigung.</p>
      <div><label for="news">Nachricht</label><textarea class="field" id="news" data-draft="news" placeholder="Hoffest am Samstag um 14 Uhr …" style="height:140px">${esc(ui.draft.news)}</textarea></div>
      <div class="actions sticky"><button class="btn accent block" data-action="post-news">Senden</button></div>
    </div>
  </section>`
}
