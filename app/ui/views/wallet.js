/**
 * Wallet side panel: USDT balance, top up, send, recovery words, lock.
 * @module ui/views/wallet
 */
import { esc, fmt, short } from '../format.js'
import { btn, link, field, page } from './parts.js'

export function walletSheet (ui) {
  const s = ui.status
  const w = s.wallet
  const account = w.kind === 'smart'
    ? 'Netzwerkgebühren bezahlst du in USDT. Du brauchst keinen anderen Token.'
    : 'Entwicklungs-Konto auf der lokalen Test-Chain.'
  return page('Konto', `
    <div class="stack">
      <div class="balance"><span class="muted small">Guthaben</span><strong>${fmt(w.usdt)} <span>${esc(w.symbol)}</span></strong></div>
      <p class="small muted">${account}</p>
      <div class="row" style="justify-content:flex-start;gap:8px">
        <button class="btn accent" data-action="open-fund">Aufladen</button>
        <button class="btn ghost" data-action="toggle-send">Senden</button>
      </div>
    </div>
    ${ui.showSend
      ? `<div class="stack card-inset">
          ${field(ui, 'sendTo', 'An Adresse', { mono: true, placeholder: '0x…' })}
          ${field(ui, 'sendAmount', `Betrag (${w.symbol})`, { mode: 'decimal' })}
          ${field(ui, 'sendPassword', 'Passwort zur Bestätigung', { type: 'password' })}
          ${btn(ui, 'send', 'Senden', 'accent block', { busy: 'Wird gesendet…' })}
        </div>`
      : ''}
    <hr class="divider">
    <div class="stack">
      <p class="small muted">Dein Konto <span class="mono">${esc(short(w.address))}</span> läuft nur auf diesem Gerät (WDK von Tether). Ohne deine Notfall-Wörter ist es bei Verlust des Geräts weg.</p>
      <div class="row" style="justify-content:flex-start;gap:20px">
        <button class="link" data-action="open-sheet" data-sheet="reveal">Notfall-Wörter anzeigen</button>
        ${link(ui, 'lock', 'Sperren')}
      </div>
    </div>
    <p class="small muted">${s.peers} ${s.peers === 1 ? 'Peer' : 'Peers'} verbunden · ${esc(s.network.name)} · Version ${esc(s.version)}</p>`)
}
