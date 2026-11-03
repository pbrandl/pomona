/**
 * First start, lock screen and the wallet sheets (create, restore, seed).
 * @module ui/views/onboarding
 */
import { esc } from '../format.js'
import { btn, field, page } from './parts.js'
import { chatBody, chatInput, homeChips } from './assistant.js'

/** First start: three pages. */
export const WALLET_STEPS = ['Passwort', 'Notfall-Wörter', 'Aufladen']

/**
 * Start screen with "Frag Pomona" docked at the bottom centre. The field is not
 * focused at first; once it is, the hero flies out to the top and the model
 * setup and example questions fly in from below.
 * @param {object} ui
 * @param {string} hero - the screen's own content
 */
export function home (ui, hero) {
  if (!ui.status?.assistant) return hero
  const on = !!ui.homeChat
  const fresh = on && ui.homeChatFresh // animate once, on the render that opens it
  return `<div class="home ${on ? 'chatting' : ''} ${fresh ? 'fresh' : ''}">
    <div class="home-hero" ${on ? 'aria-hidden="true"' : ''}>${hero}</div>
    ${on ? '<div class="page-top"><button class="link back" data-action="home-chat-close">← Zurück</button></div>' : ''}
    ${on ? `<div class="home-chat chat-scroll" id="chat-scroll">${chatBody(ui)}</div>` : ''}
    <div class="home-dock">
      ${on ? homeChips(ui) : ''}
      <div class="home-dock-row">${chatInput(ui, 'Frag Pomona …')}</div>
    </div>
  </div>`
}

export function onboarding (ui) {
  return home(ui, onboardingHero(ui))
}

function onboardingHero (ui) {
  return `<div class="center-screen stack-lg">
    <div class="stack">
      <h1 class="welcome"><span class="hl">Pomona</span> <span>Common Financing</span></h1>
      <p class="lead">Pomona ist eine Bietrunde, die auf euren Rechnern läuft, ohne Mittelsmann. Alle sagen in USDT zu, was sie pro Woche oder Monat geben. Ist das Ziel erreicht, wird Rate für Rate bezahlt, und für jede Rate gibt es einen Beleg.</p>
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
  return page('Wallet wiederherstellen', `
    <div class="stack">
      ${field(ui, 'restore', '12 oder 24 Wörter', { area: true })}
      ${field(ui, 'password', 'Neues Passwort (mind. 8 Zeichen)', { type: 'password' })}
    </div>
    ${btn(ui, 'restore', 'Wiederherstellen', 'accent block', { busy: 'Wird geprüft…' })}`)
}

export function revealSheet (ui) {
  return page('Notfall-Wörter anzeigen', `
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
