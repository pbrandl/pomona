/**
 * First start, lock screen and the wallet sheets (create, restore, seed).
 * @module ui/views/onboarding
 */
import { esc } from '../format.js'
import { btn, field, sheet } from './parts.js'

export function onboarding (ui) {
  return `<div class="center-screen stack-lg">
    <div class="stack">
      <h1>Gemeinsam finanzieren.<br><span class="muted">Ohne Mittelsmann.</span></h1>
      <p class="lead">Pomona ist eine Bietrunde, die auf euren Rechnern läuft. Alle bieten in USDT, das Geld liegt in einem Smart Contract und wird Rate für Rate abgerechnet. Wird das Ziel verfehlt, geht alles zurück.</p>
    </div>
    <div class="row" style="justify-content:flex-start">
      <button class="btn accent" data-action="open-sheet" data-sheet="create-wallet">Wallet erstellen</button>
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
  return sheet('Neue Wallet', `
    <p class="muted">Die Wallet läuft nur auf diesem Gerät. Das Passwort verschlüsselt deine Wiederherstellungsphrase.</p>
    <div class="stack">
      ${field(ui, 'password', 'Passwort (mind. 8 Zeichen)', { type: 'password' })}
      ${field(ui, 'password2', 'Passwort wiederholen', { type: 'password' })}
    </div>
    ${btn(ui, 'create-wallet', 'Wallet erstellen', 'accent block', { busy: 'Wird erstellt…' })}`)
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
  return sheet('Wiederherstellungsphrase', `
    <p class="muted">Zum Anzeigen brauchst du dein Passwort.</p>
    ${field(ui, 'password', 'Passwort', { type: 'password' })}
    ${btn(ui, 'reveal-seed', 'Anzeigen', 'accent block', { busy: 'Wird entschlüsselt…' })}`)
}

export function seedSheet (ui) {
  const words = (ui.seed || '').split(' ').map((w) => `<span>${esc(w)}</span>`).join('')
  return sheet(null, `
    <div class="stack"><h1 style="font-size:24px">Deine Wiederherstellungsphrase</h1>
    <p class="muted">Schreib diese Wörter auf Papier und bewahre sie sicher auf. Wer sie kennt, hat Zugriff auf dein Geld. Pomona zeigt sie nur mit deinem Passwort wieder an.</p></div>
    <div class="seed">${words}</div>
    <p class="small muted">Gut zu wissen: Pomona nutzt ein Smart-Konto. Importierst du diese Wörter in eine andere Wallet (z. B. MetaMask), siehst du dort eine andere Adresse und nicht dein Pomona-Guthaben. Wiederherstellen solltest du sie in Pomona.</p>
    <button class="btn accent block" data-action="seed-done">Ich habe sie notiert</button>`, { dismiss: false, close: false })
}
