/**
 * The round: progress, bidding, invoice schedule, receipts, organizer tools.
 * @module ui/views/round
 */
import { esc, fmt, num, per, date, shortDate, dateTime, short, left } from '../format.js'
import { btn, link, field } from './parts.js'

export function round (ui) {
  const r = ui.status.round
  const p = per(r.intervalName)
  return `<div class="stack-lg">
    <div class="hero stack">
      ${badge(r)}
      <h1>${esc(r.title)}</h1>
      ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
      ${!r.verified ? '<span class="badge warn">Angaben passen nicht zum Contract</span>' : ''}
      ${ring(r, p)}
    </div>
    ${stats(r, p)}
    ${bidCard(ui, r, p)}
    ${scheduleCard(ui, r, p)}
    ${receiptsCard(ui, r, p)}
    ${refundCard(ui, r)}
    ${organizerCard(ui, r, p)}
    ${newsCard(r)}
    <p class="small muted" style="text-align:center">Contract <span class="mono">${short(r.address)}</span> · ${esc(ui.status.network.name)}</p>
  </div>`
}

function badge (r) {
  switch (r.phase) {
    case 'bidding': return `<span class="badge">Bietphase bis ${esc(date(r.biddingEnd))}</span>`
    case 'running': return `<span class="badge">Läuft · ${r.invoiceCount} von ${r.installments} Raten abgerechnet</span>`
    case 'completed': return '<span class="badge neutral">Abgeschlossen</span>'
    default: return '<span class="badge warn">Ziel verfehlt</span>'
  }
}

function ring (r, p) {
  const R = 100
  const C = 2 * Math.PI * R
  const v = Math.min(1, r.progress)
  return `<div class="ring">
    <svg viewBox="0 0 220 220"><circle class="track" cx="110" cy="110" r="${R}"/><circle class="value" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v)}"/></svg>
    <div class="center"><div class="big">${fmt(r.progress * 100, 0)}%</div><div class="of">${fmt(r.total)} von ${fmt(r.target)} ${esc(r.symbol)}<br>${p.per}</div></div>
  </div>`
}

function stats (r, p) {
  const middle = r.phase === 'bidding'
    ? left(r.biddingEnd, r.now)
    : { value: `${r.invoiceCount}/${r.installments}`, unit: 'Raten abgerechnet' }
  const third = r.phase === 'bidding'
    ? { value: fmt(Math.max(0, num(r.target) - num(r.total))), unit: `fehlen ${p.per}` }
    : { value: fmt(num(r.total) * r.installments), unit: 'gesamt zugesagt' }
  return `<div class="card stats">
    <div><strong>${r.bidders}</strong><span>${r.bidders === 1 ? 'Bieter' : 'Bietende'}</span></div>
    <div><strong>${esc(middle.value)}</strong><span>${esc(middle.unit)}</span></div>
    <div><strong>${esc(third.value)}</strong><span>${esc(third.unit)}</span></div>
  </div>`
}

function bidCard (ui, r, p) {
  if (r.phase !== 'bidding') return ''
  const has = num(r.myPledge) > 0
  const amount = num(ui.draft.amount)
  const hint = amount > 0
    ? `${has ? 'Zusätzlich hinterlegst du' : 'Du hinterlegst'} ${r.installments} × ${fmt(amount)} = ${fmt(amount * r.installments)} ${esc(r.symbol)}. Abgerechnet wird ${p.adj}.`
    : num(r.minBid) > 0 ? `Mindestgebot ${fmt(r.minBid)} ${esc(r.symbol)} ${p.per}.` : `Dein Betrag ${p.per}, ${r.installments} Raten.`
  return `<div class="card stack">
    ${has
? `<div class="mine"><span class="muted">Dein Gebot</span><strong>${fmt(r.myPledge)} ${esc(r.symbol)} <span class="muted small">${p.per}</span></strong></div>
      <p class="small muted" style="margin-top:4px">${fmt(r.myDeposit)} ${esc(r.symbol)} liegen im Contract.</p>`
: ''}
    <div class="amount">
      <input id="amount" data-draft="amount" inputmode="decimal" placeholder="${has ? 'Erhöhen um' : `Dein Gebot ${p.per}`}" value="${esc(ui.draft.amount)}" autocomplete="off">
      <span class="unit">${esc(r.symbol)}</span>
      ${btn(ui, 'bid', has ? 'Erhöhen' : 'Bieten', 'accent', { busy: 'Wird bestätigt…' })}
    </div>
    <div class="row small">
      <span class="muted">${hint}</span>
      ${has ? link(ui, 'withdraw', ui.pending === 'withdraw' ? 'Wird zurückgezogen…' : 'Gebot zurückziehen') : ''}
    </div>
  </div>`
}

function scheduleCard (ui, r, p) {
  if (r.phase !== 'running' && r.phase !== 'completed') return ''
  const pct = r.installments ? (r.invoiceCount / r.installments) * 100 : 0
  let next = ''
  if (r.phase === 'running') {
    next = r.canInvoice
      ? `Rate ${r.invoiceCount + 1} ist fällig.`
      : `Rate ${r.invoiceCount + 1} ist ab ${esc(date(r.nextInvoiceAt))} fällig.`
  } else if (r.invoiceCount < r.installments) {
    next = `Die Runde endete nach ${r.invoiceCount} von ${r.installments} Raten. Der Rest geht an die Bietenden zurück.`
  } else {
    next = 'Alle Raten sind abgerechnet.'
  }
  return `<div class="card stack">
    <div class="row"><h2 style="margin:0">Abrechnung ${esc(p.adj)}</h2><span class="small muted">${r.invoiceCount} von ${r.installments}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    <p class="small muted">${next}</p>
  </div>`
}

function receiptsCard (ui, r, p) {
  if (!r.receipts.length) return ''
  const rows = r.receipts.map((x) => `<div class="list-row">
      <div><strong>Rate ${x.index + 1}</strong><span class="muted small"> · ${esc(shortDate(x.paidAt))}</span></div>
      <div class="row" style="gap:16px"><span>${fmt(x.amount)} ${esc(r.symbol)}</span>${link(ui, 'show-receipt', 'Beleg', '', { index: String(x.index) })}</div>
    </div>`).join('')
  return `<div class="card"><h2>Deine Belege</h2>${rows}</div>`
}

function refundCard (ui, r) {
  if (num(r.refundable) <= 0) return ''
  const why = r.phase === 'failed' ? 'Das Ziel wurde nicht erreicht.' : 'Diese Raten werden nicht mehr abgerechnet.'
  return `<div class="card stack">
    <div class="mine"><span class="muted">Zurück an dich</span><strong>${fmt(r.refundable)} ${esc(r.symbol)}</strong></div>
    <p class="small muted">${why} Hol dir den Betrag aus dem Contract zurück.</p>
    ${btn(ui, 'refund', 'Betrag zurückholen', 'accent block', { busy: 'Wird überwiesen…' })}
  </div>`
}

function organizerCard (ui, r, p) {
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
    const label = `Rate ${r.invoiceCount + 1} abrechnen · ${fmt(r.total)} ${r.symbol}`
    parts.push(`<div class="stack">
      ${btn(ui, 'invoice', label, 'accent block', { disabled: !r.canInvoice, busy: 'Wird abgerechnet…' })}
      ${r.canInvoice ? '' : `<p class="small muted">Nächste Rechnung ab ${esc(date(r.nextInvoiceAt))}.</p>`}
    </div>`)
  }

  parts.push(`<div class="amount" style="margin-top:16px">
      <input id="news" data-draft="news" placeholder="Neuigkeit an alle…" value="${esc(ui.draft.news)}" autocomplete="off">
      ${btn(ui, 'post-news', 'Senden', 'ghost small')}
    </div>`)

  parts.push(`<div class="stack" style="margin-top:16px">
      ${field(ui, 'verify', 'Beleg prüfen', { mono: true, placeholder: 'pomona-beleg://…' })}
      ${btn(ui, 'verify-receipt', 'Prüfen', 'ghost small', { busy: 'Wird geprüft…' })}
    </div>`)

  const danger = r.phase === 'bidding'
    ? link(ui, 'cancel', 'Runde abbrechen', 'danger')
    : r.phase === 'running' ? link(ui, 'terminate', 'Runde vorzeitig beenden', 'danger') : ''
  if (danger) parts.push(`<div class="row small" style="margin-top:12px"><span></span>${danger}</div>`)

  return `<div class="card"><h2>Organisation</h2>${parts.join('')}</div>`
}

function newsCard (r) {
  if (!r.news.length) return ''
  const items = r.news.map((n) => `<div class="news-item"><time>${esc(dateTime(n.at))}</time>${esc(n.text)}</div>`).join('')
  return `<div class="card"><h2>Neuigkeiten</h2>${items}</div>`
}
