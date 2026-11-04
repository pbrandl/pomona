/**
 * Language switch (Konto page and first start). Languages: i18n/index.js.
 * @module ui/views/language
 */
import { LANGUAGES, language, t } from '../../i18n/index.js'

export function languagePicker () {
  const now = language()
  const options = Object.entries(LANGUAGES).map(([id, { name }]) =>
    `<button class="link${id === now ? ' on' : ''}" data-action="set-language" data-lang="${id}" lang="${id}" aria-pressed="${id === now}">${name}</button>`).join('<span class="muted" aria-hidden="true">·</span>')
  return `<div class="row lang-pick" role="group" aria-label="${t('lang.label')}"><span class="small muted">${t('lang.label')}</span>${options}</div>`
}
