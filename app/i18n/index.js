/**
 * Languages. One catalog per language (de/, es/, one file per area), same keys everywhere;
 * German is the reference and the fallback. Runs in Bare (worker), Node
 * (tests) and the browser (UI), so it is plain JS without Intl.
 *
 *   t('wallet.title')                      → "Konto"
 *   t('bid.confirm', { amount: '100' })    → placeholders in {braces}
 *   t('round.bidders', { n: 3 })           → plurals: { one, other } by `n`
 *
 * A new language: copy de/ to xx/, translate the values, add it below.
 * `npm test` checks that every catalog has the same keys and placeholders.
 * @module i18n
 */
import de from './de/index.js'
import en from './en/index.js'
import es from './es/index.js'

// numbers: how amounts are written and typed ('de' = 1.234,5, 'en' = 1,234.5)
export const LANGUAGES = {
  de: { name: 'Deutsch', locale: 'de-DE', numbers: 'de', catalog: de },
  en: { name: 'English', locale: 'en-US', numbers: 'en', catalog: en },
  es: { name: 'Español', locale: 'es', numbers: 'de', catalog: es }
}
export const FALLBACK = 'de'

let current = FALLBACK

/** 'es-MX', 'es', 'ES' → 'es'; anything unknown → null. */
export function supported (tag) {
  const base = String(tag ?? '').toLowerCase().split(/[-_]/)[0]
  return Object.hasOwn(LANGUAGES, base) ? base : null
}

/** Sets the language of this process (UI or worker); returns the one in use. */
export function setLanguage (tag) {
  current = supported(tag) ?? FALLBACK
  return current
}

export const language = () => current
export const locale = () => LANGUAGES[current].locale

/** Separators of amounts in the current language. */
export const separators = () => LANGUAGES[current].numbers === 'en' ? { group: ',', decimal: '.' } : { group: '.', decimal: ',' }

function lookup (catalog, key) {
  let v = catalog
  for (const part of key.split('.')) {
    if (v == null || typeof v !== 'object') return undefined
    v = v[part]
  }
  return v
}

/** The raw catalog value (string, array, plural object) in the current language. */
export function raw (key) {
  const v = lookup(LANGUAGES[current].catalog, key)
  return v !== undefined ? v : lookup(LANGUAGES[FALLBACK].catalog, key)
}

/**
 * The text for `key` with `{placeholders}` filled in.
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 */
export function t (key, params = {}) {
  let v = raw(key)
  if (v && typeof v === 'object' && !Array.isArray(v) && 'other' in v) v = Number(params.n) === 1 ? v.one : v.other
  if (typeof v !== 'string') return key
  return v.replace(/\{(\w+)\}/g, (m, name) => (Object.hasOwn(params, name) ? String(params[name]) : m))
}
