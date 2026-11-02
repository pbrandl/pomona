/**
 * First start, lock screen and the wallet sheets (create, restore, seed).
 * @module ui/views/onboarding
 */
import { esc } from '../format.js'
import { btn, field, sheet, page } from './parts.js'

/** First start: three pages. */
export const WALLET_STEPS = ['Passwort', 'Notfall-Wörter', 'Aufladen']

export function onboarding (ui) {
  return `<div class="center-screen stack-lg">
    <div class="stack">
      <h1>Gemeinsam finanzieren.<br><span class="muted">Ohne Mittelsmann.</span></h1>
      <p class="lead">Pomona ist eine Bietrunde, die auf euren Rechnern läuft. Alle bieten in USDT, das Geld liegt in einem Treuhandkonto auf der Blockchain und wird Rate für Rate abgerechnet. Wird das Ziel verfehlt, geht alles zurück.</p>
    </div>
    <div class="row" style="justify-content:flex-start">
      <button class="btn accent" data-action="create-wallet-start">Konto anlegen</button>
      <button class="btn ghost" data-action="open-sheet" data-sheet="restore">Wiederherstellen</button>
    </div>
  </div>`
}

export function locked (ui) {
  return `<div class="center-screen stack-lg" style="max-width:380px;margin:0 auto">
    <div class="stack"><h1>Willkommen zurück.</h1><p class="lead">Deine Wallet ist gesperrt.</p></div>
    <div class="stack">
      ${field(ui, 'password', 'Passwort', { type: 'password' })}
      ${btn(ui, 'unlock', 'Entsperren', 'accent block', { busy: 'Wird entsperrt…' })}
    </div>
  </div>`
}

export function createWalletSheet (ui) {
  return page('Konto anlegen', `
    <p class="lead">Dein Konto läuft nur auf diesem Gerät. Das Passwort schützt es.</p>
    ${field(ui, 'password', 'Passwort (mind. 8 Zeichen)', { type: 'password' })}
    ${field(ui, 'password2', 'Passwort wiederholen', { type: 'password' })}
    <div class="actions sticky">${btn(ui, 'create-wallet', 'Weiter', 'accent block', { busy: 'Wird erstellt…' })}</div>`,
  { steps: WALLET_STEPS, at: 0 })
}

export function restoreSheet (ui) {
  return sheet('Wallet wiederherstellen', `
    <div class="stack">
      ${field(ui, 'restore', '12 oder 24 Wörter', { area: true })}
      ${field(ui, 'password', 'Neues Passwort (mind. 8 Zeichen)', { type: 'password' })}
    </div>
    ${btn(ui, 'restore', 'Wiederherstellen', 'accent block', { busy: 'Wird geprüft…' })}`)
}

export function revealSheet (ui) {
  return sheet('Notfall-Wörter anzeigen', `
    <p class="muted">Zum Anzeigen brauchst du dein Passwort.</p>
    ${field(ui, 'password', 'Passwort', { type: 'password' })}
    ${btn(ui, 'reveal-seed', 'Anzeigen', 'accent block', { busy: 'Wird entschlüsselt…' })}`)
}

export function seedSheet (ui) {
  const words = (ui.seed || '').split(' ').map((w) => `<span>${esc(w)}</span>`).join('')
  const onboarding = ui.onboarding
  return page('Deine Notfall-Wörter', `
    <p class="lead">Schreib diese Wörter auf Papier und bewahre sie sicher auf. Wer sie kennt, hat Zugriff auf dein Geld.</p>
    <div class="seed">${words}</div>
    <p class="small muted">Pomona zeigt sie nur mit deinem Passwort wieder an. Gut zu wissen: In anderen Wallets (z. B. MetaMask) zeigen dieselben Wörter eine andere Adresse und nicht dein Pomona-Guthaben. Wiederherstellen solltest du sie in Pomona.</p>
    <div class="actions sticky"><button class="btn accent block" data-action="seed-done">${onboarding ? 'Notiert, weiter' : 'Ich habe sie notiert'}</button></div>`,
  onboarding ? { steps: WALLET_STEPS, at: 1, back: false } : { back: false })
}
