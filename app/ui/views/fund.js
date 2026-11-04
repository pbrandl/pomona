/**
 * "Konto aufladen": how USDT gets into the wallet, with the warnings that
 * prevent lost money, and live confirmation when it arrives.
 * @module ui/views/fund
 */
import { esc, fmt, num } from '../format.js'
import { btn, page, spinner } from './parts.js'
import { t } from '../../i18n/index.js'
import { walletSteps } from './onboarding.js'

export function fundSheet (ui) {
  const s = ui.status
  const w = s.wallet
  const received = num(w.usdt) - num(ui.fundBaseline)
  const arrived = received > 0
    ? `<p class="verify ok">${t('fund.arrived', { amount: fmt(received), balance: fmt(w.usdt), symbol: esc(w.symbol) })}</p>`
    : `<p class="verify pending">${spinner} ${t('fund.waiting')}</p>`

  return page(t('fund.title'), `
    <ol class="steps">
      <li><strong>${t('fund.get')}</strong><span>${t('fund.getHow', { network: esc(s.network.name) })}</span></li>
      <li><strong>${t('fund.sendTo')}</strong><span>${t('fund.yours')}</span></li>
    </ol>
    <div class="stack" style="align-items:center">
      <div class="qr" style="width:180px;height:180px">${ui.addressQr || ''}</div>
      <div class="mono" style="word-break:break-all;text-align:center">${esc(w.address)}</div>
      <button class="btn ghost small" data-action="copy-address">${t('fund.copy')}</button>
    </div>
    ${arrived}
    <div class="warning">
      <strong>${t('fund.safeTitle')}</strong>
      <ul>
        <li>${t('fund.onlyUsdt', { network: esc(s.network.name) })}</li>
        <li>${t('fund.notRound')}</li>
        <li>${t('fund.fees')}</li>
      </ul>
    </div>
    ${s.network.dev ? `<div class="stack"><p class="small muted">${t('fund.devNote')}</p>${btn(ui, 'faucet', t('fund.faucet'), 'ghost block', { busy: t('fund.faucetBusy') })}</div>` : ''}
    <div class="actions sticky"><button class="btn ${received > 0 ? 'accent' : 'ghost'} block" data-action="close-sheet">${received > 0 ? t('common.done') : ui.onboarding ? t('fund.later') : t('common.close')}</button></div>`,
  ui.onboarding ? { steps: walletSteps(), at: 2, back: false } : {})
}
