/**
 * First start, lock screen and the wallet sheets (create, restore, seed).
 * @module ui/views/onboarding
 */
import { esc } from '../format.js'
import { btn, field, page } from './parts.js'
import { t, raw } from '../../i18n/index.js'
import { languagePicker } from './language.js'
import { chatBody, chatInput, homeChips } from './assistant.js'

/** First start: three pages. */
export const walletSteps = () => raw('onboarding.steps')

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
    ${on ? `<div class="page-top"><button class="link back" data-action="home-chat-close">${t('common.back')}</button></div>` : ''}
    ${on ? `<div class="home-chat chat-scroll" id="chat-scroll">${chatBody(ui)}</div>` : ''}
    <div class="home-dock">
      ${on ? homeChips(ui) : ''}
      <div class="home-dock-row">${chatInput(ui, t('onboarding.ask'))}</div>
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
      <p class="lead">${t('onboarding.lead')}</p>
    </div>
    <div class="row" style="justify-content:flex-start">
      <button class="btn accent" data-action="create-wallet-start">${t('onboarding.createAccount')}</button>
      <button class="btn ghost" data-action="open-sheet" data-sheet="restore">${t('onboarding.restore')}</button>
    </div>
    ${languagePicker()}
  </div>`
}

export function locked (ui) {
  return `<div class="center-screen stack-lg" style="max-width:380px;margin:0 auto">
    <div class="stack"><h1>${t('onboarding.welcomeBack')}</h1><p class="lead">${t('onboarding.locked')}</p></div>
    <div class="stack">
      ${field(ui, 'password', t('common.password'), { type: 'password' })}
      ${btn(ui, 'unlock', t('onboarding.unlock'), 'accent block', { busy: t('onboarding.unlocking') })}
    </div>
  </div>`
}

export function createWalletSheet (ui) {
  return page(t('onboarding.createAccount'), `
    <p class="lead">${t('onboarding.createLead')}</p>
    ${field(ui, 'password', t('onboarding.passwordMin'), { type: 'password' })}
    ${field(ui, 'password2', t('onboarding.passwordRepeat'), { type: 'password' })}
    <div class="actions sticky">${btn(ui, 'create-wallet', t('common.next'), 'accent block', { busy: t('onboarding.creating') })}</div>`,
  { steps: walletSteps(), at: 0 })
}

export function restoreSheet (ui) {
  return page(t('onboarding.restoreTitle'), `
    <div class="stack">
      ${field(ui, 'restore', t('onboarding.restoreWords'), { area: true })}
      ${field(ui, 'password', t('onboarding.newPassword'), { type: 'password' })}
    </div>
    ${btn(ui, 'restore', t('onboarding.restore'), 'accent block', { busy: t('onboarding.checking') })}`)
}

export function revealSheet (ui) {
  return page(t('onboarding.revealTitle'), `
    <p class="muted">${t('onboarding.revealLead')}</p>
    ${field(ui, 'password', t('common.password'), { type: 'password' })}
    ${btn(ui, 'reveal-seed', t('onboarding.reveal'), 'accent block', { busy: t('onboarding.decrypting') })}`)
}

export function seedSheet (ui) {
  const words = (ui.seed || '').split(' ').map((w) => `<span>${esc(w)}</span>`).join('')
  const onboarding = ui.onboarding
  return page(t('onboarding.seedTitle'), `
    <p class="lead">${t('onboarding.seedLead')}</p>
    <div class="seed">${words}</div>
    <p class="small muted">${t('onboarding.seedNote')}</p>
    <div class="actions sticky"><button class="btn accent block" data-action="seed-done">${onboarding ? t('onboarding.seedDoneOnboarding') : t('onboarding.seedDone')}</button></div>`,
  onboarding ? { steps: walletSteps(), at: 1, back: false } : { back: false })
}
