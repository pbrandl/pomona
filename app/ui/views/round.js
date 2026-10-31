/**
 * The round, top to bottom:
 *   hero      phase badge, title, ring (funding while bidding, installments afterwards)
 *   timeline  ① Bieten (date range, countdown)  →  ② Raten (first … last due date)
 *   bid       only while bidding
 *   plan      every installment: paid (tap → receipt/invoice), due, scheduled, void
 *   refund    when something comes back
 *   organizer share link, invoice button, check receipts, news, cancel/terminate
 *   news
 * @module ui/views/round
 */
import { esc, fmt, num, per, date, dateTime, short, left, dayTime } from '../format.js'
import { btn, link } from './parts.js'
import { statusLine } from './status.js'

export function round (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  return `<div class="stack-lg">
    ${statusLine(ui)}
    ${hero(r, p)}
    ${timeline(r, p)}
    ${bidCard(ui, r, p)}
    ${planCard(ui, r, p)}
    ${refundCard(ui, r)}
    ${organizerCard(ui, r)}
    ${newsCard(r)}
    <p class="small muted" style="text-align:center">Contract <span class="mono">${short(r.address)}</span> · ${esc(ui.status.network.name)} · <span class="live"><span class="dot on"></span>live</span></p>
  </div>`
}

// --------------------------------------------------------------------- hero

function hero (r, p) {
  const badge = {
    bidding: '<span class="badge">Bietphase läuft</span>',
    running: '<span class="badge">Ratenzahlung läuft</span>',
    completed: '<span class="badge neutral">Abgeschlossen</span>',
    failed: '<span class="badge warn">Ziel nicht erreicht</span>'
  }[r.phase]
  return `<div class="hero stack">
    ${badge}
    <h1>${esc(r.title)}</h1>
    ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
    ${!r.verified ? '<span class="badge warn">Angaben passen nicht zum Contract</span>' : ''}
    ${r.phase === 'running' || r.phase === 'completed' ? installmentRing(r, p) : fundingRing(r, p)}
    ${stats(r, p)}
  </div>`
}

function ringSvg (value) {
  const R = 100
  const C = 2 * Math.PI * R
  const v = Math.max(0, Math.min(1, value))
  return `<svg viewBox="0 0 220 220"><circle class="track" cx="110" cy="110" r="${R}"/><circle class="value" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v)}"/></svg>`
}

function fundingRing (r, p) {
  return `<div class="ring">${ringSvg(r.progress)}
    <div class="center"><div class="big">${fmt(r.progress * 100, 0)}%</div><div class="of">${fmt(r.total)} von ${fmt(r.target)} ${esc(r.symbol)}<br>${p.per}</div></div>
  </div>`
}

function installmentRing (r, p) {
  return `<div class="ring">${ringSvg(r.invoiceCount / r.installments)}
    <div class="center"><div class="big">${r.invoiceCount}<span class="muted" style="font-weight:400"> / ${r.installments}</span></div><div class="of">Raten bezahlt<br>${fmt(r.total)} ${esc(r.symbol)} ${p.per}</div></div>
  </div>`
}

function stats (r, p) {
  let cells
  if (r.phase === 'bidding') {
    const t = left(r.biddingEnd, r.now)
    cells = [
      [String(r.bidders), r.bidders === 1 ? 'Bieter' : 'Bietende'],
      [t.value, t.unit],
      [fmt(Math.max(0, num(r.target) - num(r.total))), `fehlen ${p.per}`]
    ]
  } else {
    cells = [
      [String(r.bidders), r.bidders === 1 ? 'Bieter' : 'Bietende'],
      [fmt(num(r.total)), `${r.symbol} ${p.per}`],
      [fmt(num(r.total) * r.installments), 'gesamt zugesagt']
    ]
  }
  return `<div class="card stats" style="align-self:stretch">${cells.map(([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('')}</div>`
}

// ----------------------------------------------------------------- timeline

/** The two phases with their dates. The current one is highlighted. */
function timeline (r, p) {
  const firstDue = r.biddingEnd
  const lastDue = r.biddingEnd + r.interval * (r.installments - 1)
  const bidding = r.phase === 'bidding'

  let bidState, bidText
  if (bidding) {
    const t = left(r.biddingEnd, r.now)
    const span = r.biddingStart ? Math.max(1, r.biddingEnd - r.biddingStart) : null
    const pct = span ? Math.min(100, Math.max(0, ((r.now - r.biddingStart) / span) * 100)) : null
    bidState = 'current'
    bidText = `<p class="tl-when">${r.biddingStart ? `${esc(date(r.biddingStart))} – ` : 'bis '}${esc(dayTime(r.biddingEnd))}</p>
      ${pct !== null ? `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>` : ''}
      <p class="small muted">Noch ${esc(t.value)} ${esc(t.unit.replace(' übrig', ''))}. Bis dahin kannst du bieten, erhöhen und zurückziehen.</p>`
  } else {
    bidState = r.phase === 'failed' ? 'failed' : 'done'
    bidText = `<p class="tl-when">${r.biddingStart ? `${esc(date(r.biddingStart))} – ` : 'bis '}${esc(date(r.biddingEnd))}</p>
      <p class="small muted">${r.phase === 'failed' ? 'Das Ziel wurde nicht erreicht. Alle bekommen ihr Geld zurück.' : 'Beendet. Die Gebote stehen fest.'}</p>`
  }

  let payState, payText
  const range = r.installments === 1 ? `am ${esc(date(firstDue))}` : `${esc(date(firstDue))} – ${esc(date(lastDue))}`
  const how = `${r.installments} ${r.installments === 1 ? 'Rate' : 'Raten'}, ${p.adj}`
  if (bidding) {
    payState = 'next'
    payText = `<p class="tl-when">${range}</p><p class="small muted">${how}. Startet automatisch, wenn die Bietphase endet und das Ziel erreicht ist. Pro Rate stellt der Organisator eine Rechnung.</p>`
  } else if (r.phase === 'running') {
    payState = 'current'
    payText = `<p class="tl-when">${range}</p><p class="small muted">${how}. ${r.invoiceCount} von ${r.installments} bezahlt.</p>`
  } else if (r.phase === 'completed') {
    payState = 'done'
    payText = `<p class="tl-when">${range}</p><p class="small muted">${r.invoiceCount} von ${r.installments} Raten bezahlt.${r.invoiceCount < r.installments ? ' Der Rest geht an die Bietenden zurück.' : ''}</p>`
  } else {
    payState = 'skipped'
    payText = '<p class="small muted">Findet nicht statt.</p>'
  }

  return `<div class="card timeline">
    <div class="tl-step ${bidState}"><div class="tl-dot">1</div><div class="tl-body"><h3>Bieten</h3>${bidText}</div></div>
    <div class="tl-step ${payState}"><div class="tl-dot">2</div><div class="tl-body"><h3>Ratenzahlung per Rechnung</h3>${payText}</div></div>
  </div>`
}

// ---------------------------------------------------------------------- bid

function bidCard (ui, r, p) {
  if (r.phase !== 'bidding') return ''
  const has = num(r.myPledge) > 0
  if (!has) {
    return `<div class="card stack" id="bid-card">
      <div class="row"><h2 style="margin:0">Mitbieten</h2><span class="small muted">bis ${esc(dayTime(r.biddingEnd))}</span></div>
      ${r.guide ? `<p class="muted">Richtwert ${fmt(r.guide)} ${esc(r.symbol)} ${p.per}. Gib, was du kannst.</p>` : ''}
      <button class="btn accent block" data-action="start-bid">Gebot abgeben</button>
    </div>`
  }
  return `<div class="card stack" id="bid-card">
    <div class="row"><h2 style="margin:0">Dein Gebot</h2><span class="small muted">änderbar bis ${esc(dayTime(r.biddingEnd))}</span></div>
    <div class="mine"><span class="muted">${fmt(r.myDeposit)} ${esc(r.symbol)} hinterlegt</span><strong>${fmt(r.myPledge)} ${esc(r.symbol)} <span class="muted small">${p.per}</span></strong></div>
    <div class="row" style="justify-content:flex-start;gap:12px">
      <button class="btn ghost" data-action="start-bid">Erhöhen</button>
      ${link(ui, 'withdraw', ui.pending === 'withdraw' ? 'Wird zurückgezogen…' : 'Zurückziehen')}
    </div>
  </div>`
}

// --------------------------------------------------------------------- plan

const STATUS = {
  paid: (x) => `<span class="pill-s ok">Bezahlt ${esc(date(x.paidAt))}</span>`,
  due: () => '<span class="pill-s due">Fällig</span>',
  scheduled: () => '<span class="pill-s">Geplant</span>',
  void: () => '<span class="pill-s void">Entfällt</span>'
}

/**
 * All installments. Paid ones open the receipt (bidder) or the invoice
 * (organizer). Long plans are folded around the current installment.
 */
function planCard (ui, r, p) {
  if (r.phase === 'failed' || !r.invoices?.length) return ''
  const organizer = r.role === 'organizer'
  const mine = r.invoices.some((x) => x.mine)
  const list = fold(r.invoices, r.invoiceCount, ui.showAllInvoices)

  const rows = list.map((x) => {
    if (x.more) return `<button class="plan-more" data-action="show-all-invoices">… ${x.more} weitere Raten anzeigen</button>`
    const clickable = x.status === 'paid' && (organizer || x.mine)
    const action = organizer ? 'show-invoice' : 'show-receipt'
    const attrs = clickable ? ` data-action="${action}" data-index="${x.index}" role="button" tabindex="0"` : ''
    return `<div class="plan-row ${x.status}${clickable ? ' clickable' : ''}"${attrs}>
      <div class="plan-left"><strong>Rate ${x.index + 1}</strong><span class="muted small">${x.status === 'paid' ? '' : 'fällig ab ' + esc(date(x.dueAt))}</span></div>
      <div class="plan-right"><span>${fmt(x.amount)} ${esc(r.symbol)}</span>${STATUS[x.status](x)}${clickable ? '<span class="chev" aria-hidden="true">›</span>' : ''}</div>
    </div>`
  }).join('')

  const title = organizer ? 'Rechnungen' : mine ? 'Deine Raten' : 'Raten'
  const sub = r.phase === 'bidding'
    ? 'Vorschau. Die Rechnungen beginnen mit dem Ende der Bietphase.'
    : organizer ? 'Tippe auf eine bezahlte Rechnung für Details.' : mine ? 'Tippe auf eine bezahlte Rate, um den Beleg zu sehen.' : ''
  return `<div class="card">
    <div class="row"><h2 style="margin:0">${title}</h2><span class="small muted">${p.adj}</span></div>
    ${sub ? `<p class="small muted" style="margin:6px 0 14px">${sub}</p>` : ''}
    ${rows}
  </div>`
}

/** Shows everything for up to 14 rows; otherwise paid tail + current + a few upcoming. */
function fold (invoices, paid, all) {
  if (all || invoices.length <= 14) return invoices
  const from = Math.max(0, paid - 3)
  const to = Math.min(invoices.length, paid + 4)
  const out = []
  if (from > 0) out.push({ more: from })
  out.push(...invoices.slice(from, to))
  if (to < invoices.length) out.push({ more: invoices.length - to })
  return out
}

// ------------------------------------------------------------------- refund

function refundCard (ui, r) {
  if (num(r.refundable) <= 0) return ''
  const why = r.phase === 'failed' ? 'Das Ziel wurde nicht erreicht.' : 'Diese Raten werden nicht mehr abgerechnet.'
  return `<div class="card stack">
    <div class="mine"><span class="muted">Zurück an dich</span><strong>${fmt(r.refundable)} ${esc(r.symbol)}</strong></div>
    <p class="small muted">${why} Hol dir den Betrag aus dem Contract zurück.</p>
    ${btn(ui, 'refund', 'Betrag zurückholen', 'accent block', { busy: 'Wird überwiesen…' })}
  </div>`
}

// ---------------------------------------------------------------- organizer

function organizerCard (ui, r) {
  if (r.role !== 'organizer') return ''
  const parts = []

  if (r.phase === 'bidding') {
    const inv = ui.invite
    parts.push(`<div class="share">
      <div class="qr">${inv ? inv.qr : ''}</div>
      <div class="stack" style="min-width:0">
        <p class="small muted">${r.inviteOnly ? 'Nur wer diesen Link hat, kann bieten.' : 'Jeder mit dem Link kann bieten.'}</p>
        <div class="linkbox">${esc(inv?.link || '')}</div>
        <button class="btn ghost small" data-action="copy-invite">Link kopieren</button>
      </div>
    </div>`)
  }

  if (r.phase === 'running') {
    const next = r.invoiceCount + 1
    parts.push(`<div class="stack">
      ${btn(ui, 'invoice', `Rechnung ${next} stellen · ${fmt(r.total)} ${r.symbol}`, 'accent block', { disabled: !r.canInvoice, busy: 'Wird abgerechnet…' })}
      ${r.canInvoice ? '' : `<p class="small muted">Rechnung ${next} ist ab ${esc(dayTime(r.nextInvoiceAt))} möglich.</p>`}
    </div>`)
  }

  if (r.phase !== 'bidding' && r.invoiceCount > 0) {
    parts.push('<div class="row" style="margin-top:16px"><p class="small muted">Bietende zeigen ihren Beleg als QR-Code.</p><button class="btn ghost small" data-action="open-scan">Beleg prüfen</button></div>')
  }

  parts.push(`<div class="amount" style="margin-top:16px">
      <input id="news" data-draft="news" placeholder="Neuigkeit an alle…" value="${esc(ui.draft.news)}" autocomplete="off">
      ${btn(ui, 'post-news', 'Senden', 'ghost small')}
    </div>`)

  const danger = r.phase === 'bidding'
    ? link(ui, 'cancel', 'Runde abbrechen', 'danger')
    : r.phase === 'running' ? link(ui, 'terminate', 'Ratenzahlung vorzeitig beenden', 'danger') : ''
  if (danger) parts.push(`<div class="row small" style="margin-top:12px"><span></span>${danger}</div>`)

  return `<div class="card"><h2>Organisation</h2>${parts.join('')}</div>`
}

function newsCard (r) {
  if (!r.news.length) return ''
  const items = r.news.map((n) => `<div class="news-item"><time>${esc(dateTime(n.at))}</time>${esc(n.text)}</div>`).join('')
  return `<div class="card"><h2>Neuigkeiten</h2>${items}</div>`
}
