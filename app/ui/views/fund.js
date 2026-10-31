/**
 * "Konto aufladen": how USDT gets into the wallet, with the warnings that
 * prevent lost money, and live confirmation when it arrives.
 * @module ui/views/fund
 */
import { esc, fmt, num } from '../format.js'
import { btn, page, spinner } from './parts.js'
import { WALLET_STEPS } from './onboarding.js'

export function fundSheet (ui) {
  const s = ui.status
  const w = s.wallet
  const received = num(w.usdt) - num(ui.fundBaseline)
  const arrived = received > 0
    ? `<p class="verify ok">✓ ${fmt(received)} ${esc(w.symbol)} sind angekommen. Guthaben jetzt ${fmt(w.usdt)} ${esc(w.symbol)}.</p>`
    : `<p class="verify pending">${spinner} Warte auf Eingang… Das dauert meist nur Sekunden.</p>`

  return page('Konto aufladen', `
    <ol class="steps">
      <li><strong>USDT besorgen</strong><span>z. B. bei einer Börse oder von einer anderen Wallet, auf dem Netzwerk <strong>${esc(s.network.name)}</strong>.</span></li>
      <li><strong>An diese Adresse senden</strong><span>Das ist dein persönliches Pomona-Konto.</span></li>
    </ol>
    <div class="stack" style="align-items:center">
      <div class="qr" style="width:180px;height:180px">${ui.addressQr || ''}</div>
      <div class="mono" style="word-break:break-all;text-align:center">${esc(w.address)}</div>
      <button class="btn ghost small" data-action="copy-address">Adresse kopieren</button>
    </div>
    ${arrived}
    <div class="warning">
      <strong>Damit nichts verloren geht</strong>
      <ul>
        <li>Nur <strong>USDT</strong> senden, und nur über <strong>${esc(s.network.name)}</strong>. Andere Tokens oder Netzwerke kommen nicht an.</li>
        <li>Nie direkt an die Adresse einer Runde senden. Bieten geht nur über Pomona.</li>
        <li>Netzwerkgebühren bezahlst du ebenfalls in USDT. Du brauchst keinen anderen Token.</li>
      </ul>
    </div>
    ${s.network.dev ? `<div class="stack"><p class="small muted">Lokale Test-Chain: Testguthaben per Klick.</p>${btn(ui, 'faucet', '5.000 Test-USDT holen', 'ghost block', { busy: 'Wird überwiesen…' })}</div>` : ''}
    <div class="actions sticky"><button class="btn ${received > 0 ? 'accent' : 'ghost'} block" data-action="close-sheet">${received > 0 ? 'Fertig' : ui.onboarding ? 'Später aufladen' : 'Schließen'}</button></div>`,
  ui.onboarding ? { steps: WALLET_STEPS, at: 2, back: false } : {})
}
