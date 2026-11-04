/**
 * Wallet side panel: USDT balance, top up, send, recovery words, lock.
 * @module ui/views/wallet
 */
import { esc, fmt, short } from '../format.js'
import { btn, link, field, page } from './parts.js'
import { t } from '../../i18n/index.js'
import { languagePicker } from './language.js'

export function walletSheet (ui) {
  const s = ui.status
  const w = s.wallet
  const account = w.kind === 'smart'
    ? t('wallet.smart')
    : t('wallet.dev')
  return page(t('wallet.title'), `
    <div class="stack">
      <div class="balance"><span class="muted small">${t('wallet.balance')}</span><strong>${fmt(w.usdt)} <span>${esc(w.symbol)}</span></strong></div>
      <p class="small muted">${account}</p>
      <div class="row" style="justify-content:flex-start;gap:8px">
        <button class="btn accent" data-action="open-fund">${t('wallet.fund')}</button>
        <button class="btn ghost" data-action="toggle-send">${t('wallet.send')}</button>
      </div>
    </div>
    ${ui.showSend
      ? `<div class="stack card-inset">
          ${field(ui, 'sendTo', t('wallet.to'), { mono: true, placeholder: '0x…' })}
          ${field(ui, 'sendAmount', t('wallet.amount', { symbol: w.symbol }), { mode: 'decimal' })}
          ${field(ui, 'sendPassword', t('wallet.confirmPassword'), { type: 'password' })}
          ${btn(ui, 'send', t('wallet.send'), 'accent block', { busy: t('common.sending') })}
        </div>`
      : ''}
    <hr class="divider">
    <div class="stack">
      <p class="small muted">${t('wallet.deviceOnly', { address: esc(short(w.address)) })}</p>
      <div class="row" style="justify-content:flex-start;gap:20px">
        <button class="link" data-action="open-sheet" data-sheet="reveal">${t('wallet.showWords')}</button>
        ${link(ui, 'lock', t('wallet.lock'))}
      </div>
    </div>
    <p class="small muted">${t('wallet.peers', { n: s.peers })} · ${esc(s.network.name)} · ${t('wallet.version', { v: esc(s.version) })}</p>
    ${languagePicker()}`)
}
