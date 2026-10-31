/**
 * Wallet side panel: USDT balance, receive (address + QR), send, seed, lock.
 * @module ui/views/wallet
 */
import { esc, fmt } from '../format.js'
import { btn, link, field, sheet } from './parts.js'

export function walletSheet (ui) {
  const s = ui.status
  const w = s.wallet
  const account = w.kind === 'smart'
    ? 'Smart Account (ERC-4337). Netzwerkgebühren werden in USDT bezahlt.'
    : 'Entwicklungs-Account auf der lokalen Test-Chain.'
  return sheet('Wallet', `
    <div class="stack">
      <div class="mine"><span class="muted">Guthaben</span><strong>${fmt(w.usdt)} ${esc(w.symbol)}</strong></div>
      <p class="small muted">${account}</p>
    </div>
    <div class="stack">
      <h2 style="margin:0">Empfangen</h2>
      <div class="qr" style="width:160px;height:160px">${ui.addressQr || ''}</div>
      <div class="mono" style="word-break:break-all">${esc(w.address)}</div>
      <p class="small muted">Nur ${esc(w.symbol)} auf ${esc(s.network.name)} an diese Adresse senden.</p>
      <button class="btn ghost small" data-action="copy-address">Adresse kopieren</button>
    </div>
    <div class="stack">
      <h2 style="margin:0">Senden</h2>
      ${field(ui, 'sendTo', 'An Adresse', { mono: true, placeholder: '0x…' })}
      ${field(ui, 'sendAmount', `Betrag (${w.symbol})`, { mode: 'decimal' })}
      ${field(ui, 'sendPassword', 'Passwort zur Bestätigung', { type: 'password' })}
      ${btn(ui, 'send', 'Senden', 'ghost block', { busy: 'Wird gesendet…' })}
    </div>
    ${s.network.dev ? `<div class="stack"><p class="small muted">Lokale Test-Chain: hol dir 5.000 Test-USDT.</p>${btn(ui, 'faucet', 'Testguthaben holen', 'ghost block', { busy: 'Wird überwiesen…' })}</div>` : ''}
    <hr class="divider">
    <div class="stack">
      <p class="small muted">Deine Wallet läuft nur auf diesem Gerät (WDK von Tether). Ohne Wiederherstellungsphrase ist sie bei Verlust weg.</p>
      <div class="row" style="justify-content:flex-start;gap:20px">
        <button class="link" data-action="open-sheet" data-sheet="reveal">Wiederherstellungsphrase</button>
        ${link(ui, 'lock', 'Sperren')}
      </div>
    </div>
    <p class="small muted">${s.peers} ${s.peers === 1 ? 'Peer' : 'Peers'} verbunden · ${esc(s.network.name)}</p>`)
}
