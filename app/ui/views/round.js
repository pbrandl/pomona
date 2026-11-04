/**
 * The round on one page, lean:
 *
 *   header    phase · deadline, title with website and invite, pledged total
 *   progress  ring beside bidders · average · median (below it on phones)
 *   you       your situation and the single next action (views/you.js)
 *   track     the installments as dots on a line: received above, outstanding
 *             below, paid ones ticked. Tap a dot for receipt, payment or details.
 *   news      newest message, the rest folded
 *   manage    organizer tools as quiet links
 *
 * @module ui/views/round
 */
import { esc, fmt, num, per, shortDate, dateTime, short } from '../format.js'
import { link, page } from './parts.js'
import { youCard } from './you.js'
import { ICON } from './icons.js'
import { t } from '../../i18n/index.js'

export function round (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  return `<div class="stack-lg">
    ${header(r, p)}
    ${progress(r, p)}
    ${youCard(ui)}
    ${track(ui, r, p)}
    ${news(ui, r)}
    ${manage(ui, r)}
    <p class="small muted" style="text-align:center">${t(r.mode === 'invoice' ? 'create.round' : 'round.escrow')} <span class="mono">${short(r.address)}</span> · ${esc(ui.status.network.name)} · <span class="live"><span class="dot on"></span>live</span></p>
  </div>`
}

// ------------------------------------------------------------------- header

function header (r, p) {
  const eyebrow = {
    bidding: () => t('round.phase.bidding', { end: dateTime(r.biddingEnd * 1000) }),
    running: () => t(r.mode === 'invoice' ? 'round.phase.runningInvoice' : 'round.phase.runningDeposit', { i: r.invoiceCount, n: r.installments }),
    completed: () => t('round.phase.completed'),
    failed: () => t('round.phase.failed')
  }[r.phase]()
  // The website comes from the (sanitized) manifest: http(s) only, opens outside.
  const web = r.website
    ? `<a class="icon-btn" href="${esc(r.website)}" target="_blank" rel="noopener noreferrer" title="${t('round.website')}" aria-label="${t('round.website')}">${ICON.web}</a>`
    : ''
  // Everyone can invite while bidding is open; afterwards nobody can join.
  // One button: the invite page shows the QR code and "Link kopieren".
  const invite = r.phase === 'bidding'
    ? `<button class="icon-btn" data-action="open-sheet" data-sheet="invite" title="${t('round.invite')}" aria-label="${t('round.inviteAria')}">${ICON.share}</button>`
    : ''
  const share = web || invite ? `<div class="head-actions">${web}${invite}</div>` : ''
  return `<div class="round-head">
    <p class="eyebrow ${r.phase}">${esc(eyebrow)}</p>
    <div class="title-row"><h1 class="one-line" title="${esc(r.title)}">${esc(r.title)}</h1>${share}</div>
    <p class="pledged">${t('round.pledged', { total: `<strong>${fmt(r.total, 0)}</strong>`, target: fmt(r.target, 0), symbol: esc(r.symbol), per: p.per })}</p>
    ${!r.verified ? `<p class="warn-text small">${t('round.unverified')}</p>` : ''}
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
  const center = `<div class="big">${fmt(r.progress * 100, 0)}%</div><div class="of">${t('round.ofTarget')}</div>`
  const stat = (value, label) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`
  return `<div class="progress split">
    <div class="ring">${ringSvg(r.progress)}<div class="center">${center}</div></div>
    <div class="stats">
      ${stat(fmt(r.bidders), t('round.bidders', { n: r.bidders }))}
      ${stat(r.average ? `${fmt(r.average, 0)} <small>${sym}</small>` : '–', t('round.average'))}
      ${stat(r.median ? `${fmt(r.median, 0)} <small>${sym}</small>` : '–', t('round.median'))}
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

  const label = t(payg ? 'round.invoiceDot' : 'round.installmentDot', { i: x.index + 1, day: shortDate(x.dueAt) })
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

/**
 * @param {{ asBidder?: boolean }} [o] - asBidder: the organizer's bid page, own installments
 */
function track (ui, r, p, { asBidder = false } = {}) {
  const list = asBidder ? r.myInvoices : r.invoices
  if (r.phase === 'failed' || !list?.length) return ''
  const organizer = r.role === 'organizer' && !asBidder
  const mine = list.some((x) => x.mine)
  const cols = list.map((x) => column(r, x, organizer))
  const got = cols.reduce((s, c) => s + c.got, 0)
  const due = cols.reduce((s, c) => s + c.due, 0)
  const sym = esc(r.symbol)

  const words = organizer
    ? { top: t('round.received'), bottom: t('round.outstanding') }
    : mine
      ? { top: t('round.paid'), bottom: r.mode === 'invoice' ? t('round.toPay') : t('round.outstanding') }
      : { top: t('round.received'), bottom: t('round.planned') }
  const paid = list.filter((x) => x.status === 'paid').length
  const title = organizer || !mine
    ? t(r.mode === 'invoice' ? 'round.invoicesTitle' : 'round.installmentsTitle', { n: r.installments, adj: esc(p.adj) })
    : t('round.yourInstallments', { adj: esc(p.adj) })
  const summary = mine && !organizer ? t('round.paidOf', { paid, n: r.installments }) : t('round.receivedSum', { amount: fmt(got), symbol: sym })

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
      <h2>${t('round.news')}</h2>
      ${older.length ? `<span class="small muted">${open ? t('round.less') : t('round.older', { n: older.length })}<span class="chev ${open ? 'up' : ''}" aria-hidden="true">›</span></span>` : ''}
    </button>
    ${item(latest)}
    ${open ? older.map(item).join('') : ''}
  </div>`
}

// ------------------------------------------------------------------- manage

function manage (ui, r) {
  if (r.role !== 'organizer') return ''
  const rows = [ownRow(r), `<button class="manage-row" data-action="open-sheet" data-sheet="news">${t('round.writeNews')}<span class="chev">›</span></button>`].filter(Boolean)
  if (r.invoiceCount > 0) rows.push(`<button class="manage-row" data-action="open-scan">${t('agent.action.page.scan')}<span class="chev">›</span></button>`)
  const danger = r.phase === 'bidding'
    ? link(ui, 'cancel', t('round.cancel'), 'danger')
    : r.phase === 'running' ? link(ui, 'terminate', t('round.terminate'), 'danger') : ''
  return `<div class="card manage">
    <h2>${t('round.manage')}</h2>
    ${rows.join('')}
    ${danger ? `<div class="manage-danger">${danger}</div>` : ''}
  </div>`
}

/**
 * The organizer's way to their own bid page: what is open for them, or the
 * offer to bid, too. Nothing once bidding is over without a bid of their own.
 */
function ownRow (r) {
  const sym = esc(r.symbol)
  const pledge = num(r.myPledge)
  const [text, act] = num(r.refundable) > 0
    ? [t('round.ownRefund', { amount: fmt(r.refundable), symbol: sym }), true]
    : pledge > 0 && r.openInvoices > 0
      ? [t('round.ownOpen', { amount: fmt(r.openAmount), symbol: sym }), true]
      : pledge > 0
        ? [t('round.ownPledge', { amount: fmt(r.myPledge), symbol: sym, per: esc(per(r.intervalName).per) }), false]
        : r.phase === 'bidding' ? [t('round.ownBid'), false] : ['', false]
  if (!text) return ''
  return `<button class="manage-row${act ? ' act' : ''}" data-action="open-sheet" data-sheet="own">${text}<span class="chev">›</span></button>`
}

/**
 * Page: the organizer's own bid ("Bietseite"). They bid from their own wallet
 * like everyone else, and see their part here as every bidder does; the
 * project page keeps showing the whole round.
 */
export function ownPage (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  return page(null, `
    <div class="round-head">
      <p class="eyebrow">${t('round.ownPage')}</p>
      <div class="title-row"><h1 class="one-line" title="${esc(r.title)}">${esc(r.title)}</h1></div>
      <p class="small muted">${t('round.ownLead')}</p>
    </div>
    ${youCard(ui, { asBidder: true })}
    ${track(ui, r, p, { asBidder: true })}`)
}

/** Page: the invite as a QR code, to show on a phone or print out. */
export function invitePage (ui) {
  const r = ui.status.round
  const inv = ui.invite
  return page(t('round.invite'), `
    <div class="invite-qr">
      <div class="qr">${inv ? inv.qr : ''}</div>
      <strong>${esc(r.title)}</strong>
      <span class="small muted">${t(r.inviteOnly ? 'round.inviteOnly' : 'round.inviteAll')}</span>
    </div>
    <button class="btn accent block" data-action="copy-invite">${ICON.share}<span>${t('round.copyLink')}</span></button>`)
}

/** Page: write a news message (one step, one page). */
export function newsPage (ui) {
  return `<section class="page">
    <div class="page-top"><button class="link back" data-action="close-sheet">${t('common.back')}</button></div>
    <h1 class="page-title">${t('round.newsTitle')}</h1>
    <div class="stack-lg">
      <p class="lead">${t('round.newsLead')}</p>
      <div><label for="news">${t('round.message')}</label><textarea class="field" id="news" data-draft="news" placeholder="${t('round.newsPlaceholder')}" style="height:140px">${esc(ui.draft.news)}</textarea></div>
      <div class="actions sticky"><button class="btn accent block" data-action="post-news">${t('wallet.send')}</button></div>
    </div>
  </section>`
}
