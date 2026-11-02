/**
 * The round, lean: one message per block, each fact once.
 *
 *   header    phase · time left, title, description
 *   progress  ring with the one key number, one line of facts
 *   you       your situation and the single next action (views/you.js)
 *   share     organizer during bidding: invite link + QR
 *   timeline  ① Bieten → ② Raten, two short lines
 *   plan      installments (folded to a few rows), tap a paid one → receipt
 *   news      latest message, more on demand
 *   manage    organizer tools as quiet links
 *
 * @module ui/views/round
 */
import { esc, fmt, per, date, shortDate, dateTime, short, left } from '../format.js'
import { link } from './parts.js'
import { youCard } from './you.js'

export function round (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  return `<div class="stack-lg">
    ${header(r)}
    ${progress(r, p)}
    ${youCard(ui)}
    ${share(ui, r)}
    ${timeline(r, p)}
    ${plan(ui, r, p)}
    ${news(ui, r)}
    ${manage(ui, r)}
    <p class="small muted" style="text-align:center">Treuhandkonto <span class="mono">${short(r.address)}</span> · ${esc(ui.status.network.name)} · <span class="live"><span class="dot on"></span>live</span></p>
  </div>`
}

// ------------------------------------------------------------------- header

function header (r) {
  const t = left(r.biddingEnd, r.now)
  const eyebrow = {
    bidding: `Bietphase · noch ${t.value} ${t.unit.replace(' übrig', '')}`,
    running: `Ratenzahlung · ${r.invoiceCount} von ${r.installments} bezahlt`,
    completed: 'Abgeschlossen',
    failed: 'Ziel nicht erreicht'
  }[r.phase]
  return `<div class="round-head">
    <p class="eyebrow ${r.phase}">${esc(eyebrow)}</p>
    <h1>${esc(r.title)}</h1>
    ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
    ${!r.verified ? '<p class="warn-text small">Die Angaben des Organisators passen nicht zum Treuhandkonto. Vorsicht.</p>' : ''}
  </div>`
}

// ----------------------------------------------------------------- progress

function ringSvg (value) {
  const R = 100
  const C = 2 * Math.PI * R
  const v = Math.max(0, Math.min(1, value))
  return `<svg viewBox="0 0 220 220"><circle class="track" cx="110" cy="110" r="${R}"/><circle class="value" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v)}"/></svg>`
}

function progress (r, p) {
  const paying = r.phase === 'running' || r.phase === 'completed'
  const center = paying
    ? `<div class="big">${r.invoiceCount}<span class="muted" style="font-weight:400">/${r.installments}</span></div><div class="of">Raten</div>`
    : `<div class="big">${fmt(r.progress * 100, 0)}%</div><div class="of">vom Ziel</div>`
  const facts = paying
    ? `${fmt(r.total)} ${esc(r.symbol)} ${p.per} · ${r.bidders} ${r.bidders === 1 ? 'Bieter' : 'Bietende'}`
    : `${fmt(r.total)} von ${fmt(r.target)} ${esc(r.symbol)} ${p.per} · ${r.bidders} ${r.bidders === 1 ? 'Bieter' : 'Bietende'}`
  return `<div class="progress">
    <div class="ring small">${ringSvg(paying ? r.invoiceCount / r.installments : r.progress)}<div class="center">${center}</div></div>
    <p class="muted">${facts}</p>
  </div>`
}

// -------------------------------------------------------------------- share

function share (ui, r) {
  if (r.role !== 'organizer' || r.phase !== 'bidding') return ''
  const inv = ui.invite
  return `<div class="card share">
    <div class="qr">${inv ? inv.qr : ''}</div>
    <div class="stack" style="min-width:0">
      <h2 style="margin:0">Einladen</h2>
      <p class="small muted">${r.inviteOnly ? 'Nur wer diesen Link hat, kann bieten.' : 'Jeder mit dem Link kann bieten.'}</p>
      <button class="btn ghost small" data-action="copy-invite">Link kopieren</button>
    </div>
  </div>`
}

// ----------------------------------------------------------------- timeline

function timeline (r, p) {
  const lastDue = r.biddingEnd + r.interval * (r.installments - 1)
  const bidding = r.phase === 'bidding'
  const span = r.biddingStart ? Math.max(1, r.biddingEnd - r.biddingStart) : null
  const pct = bidding && span ? Math.min(100, Math.max(0, ((r.now - r.biddingStart) / span) * 100)) : null

  const bidState = bidding ? 'current' : r.phase === 'failed' ? 'failed' : 'done'
  const bidWhen = `${r.biddingStart ? esc(date(r.biddingStart)) + ' – ' : 'bis '}${esc(date(r.biddingEnd))}`

  const payState = { bidding: 'next', running: 'current', completed: 'done', failed: 'skipped' }[r.phase]
  const payWhen = r.installments === 1 ? esc(date(r.biddingEnd)) : `${esc(date(r.biddingEnd))} – ${esc(date(lastDue))}`
  const payNote = {
    bidding: 'Startet, wenn das Ziel erreicht ist.',
    running: `${r.invoiceCount} von ${r.installments} bezahlt.`,
    completed: r.invoiceCount < r.installments ? 'Vorzeitig beendet. Der Rest ging zurück.' : 'Alle Raten bezahlt.',
    failed: 'Findet nicht statt.'
  }[r.phase]

  return `<div class="card timeline">
    <div class="tl-step ${bidState}"><div class="tl-dot">1</div><div class="tl-body">
      <h3>Bieten</h3><p class="tl-when">${bidWhen}</p>
      ${pct !== null ? `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>` : ''}
    </div></div>
    <div class="tl-step ${payState}"><div class="tl-dot">2</div><div class="tl-body">
      <h3>${r.installments} Raten, ${esc(p.adj)}</h3><p class="tl-when">${payWhen}</p><p class="small muted">${payNote}</p>
    </div></div>
  </div>`
}

// --------------------------------------------------------------------- plan

const STATUS = {
  paid: () => '<span class="pill-s ok">Bezahlt</span>',
  due: () => '<span class="pill-s due">Fällig</span>',
  scheduled: () => '<span class="pill-s">Geplant</span>',
  void: () => '<span class="pill-s void">Entfällt</span>'
}

function plan (ui, r, p) {
  if (r.phase === 'failed' || !r.invoices?.length) return ''
  const organizer = r.role === 'organizer'
  const mine = r.invoices.some((x) => x.mine)
  const list = fold(r.invoices, r.invoiceCount, ui.showAllInvoices)

  const rows = list.map((x) => {
    if (x.more) return `<button class="plan-more" data-action="show-all-invoices">Alle ${r.invoices.length} Raten anzeigen</button>`
    const clickable = x.status === 'paid' && (organizer || x.mine)
    const action = organizer ? 'show-invoice' : 'show-receipt'
    const attrs = clickable ? ` data-action="${action}" data-index="${x.index}" role="button" tabindex="0"` : ''
    return `<div class="plan-row ${x.status}${clickable ? ' clickable' : ''}"${attrs}>
      <div class="plan-left"><strong>Rate ${x.index + 1}</strong><span class="muted small">${x.status === 'paid' ? esc(shortDate(x.paidAt)) + (clickable ? (organizer ? ' · Details' : ' · Beleg') : '') : 'ab ' + esc(shortDate(x.dueAt))}</span></div>
      <div class="plan-right"><span>${fmt(x.amount)} ${esc(r.symbol)}</span>${STATUS[x.status](x)}${clickable ? '<span class="chev" aria-hidden="true">›</span>' : ''}</div>
    </div>`
  }).join('')

  const title = organizer ? 'Rechnungen' : mine ? 'Deine Raten' : 'Raten'
  return `<div class="card">
    <div class="row" style="margin-bottom:8px"><h2 style="margin:0">${title}</h2><span class="small muted">${p.adj}</span></div>
    ${rows}
  </div>`
}

/** A few rows around "now": the last paid, the next ones. Everything on demand. */
function fold (invoices, paid, all) {
  if (all || invoices.length <= 4) return invoices
  const from = Math.max(0, Math.min(paid - 1, invoices.length - 4))
  const shown = invoices.slice(from, from + 4)
  return [...shown, { more: true }]
}

// --------------------------------------------------------------------- news

function news (ui, r) {
  if (!r.news.length) return ''
  const list = ui.showAllNews ? r.news : r.news.slice(0, 1)
  const items = list.map((n) => `<div class="news-item"><time>${esc(dateTime(n.at))}</time>${esc(n.text)}</div>`).join('')
  const more = !ui.showAllNews && r.news.length > 1
    ? `<button class="plan-more" data-action="show-all-news">Alle ${r.news.length} Neuigkeiten</button>`
    : ''
  return `<div class="card"><h2>Neuigkeiten</h2>${items}${more}</div>`
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
