/**
 * Tiny formatting helpers for the assistant and the worker; texts from i18n/. Pure JS without Intl, so
 * they behave the same in Bare (worker), Node (tests) and the browser (mock).
 * @module core/agent/words
 */
import { plainDecimal } from '../decimal.js'
import { t, raw } from '../../i18n/index.js'

/** 1234.5 → "1.234,5" (max. 2 decimals; same style in every language, like the input) */
export function num (value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  const [int, frac = ''] = (Math.round(n * 100) / 100).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const f = frac.replace(/0+$/, '')
  return f ? `${grouped},${f}` : grouped
}

/** unix seconds → "12. November 2026" / "12 de noviembre de 2026" (UTC, stable across runtimes) */
export function day (time) {
  const d = new Date(time * 1000)
  return t('date.day', { d: d.getUTCDate(), month: raw('date.months')[d.getUTCMonth()], y: d.getUTCFullYear() })
}

/** "noch 12 Tage" / "noch 5 Stunden" / "vorbei" */
export function until (time, now) {
  const s = time - now
  if (s <= 0) return t('date.over')
  if (s >= 2 * 86400) return t('date.days', { n: Math.floor(s / 86400) })
  if (s >= 3600) return t('date.hours', { n: Math.floor(s / 3600) })
  return t('date.minutes', { n: Math.max(1, Math.floor(s / 60)) })
}

/** { unit, adj, plural, per } of the interval ("pro Monat", "monatlich", …) */
export function per (intervalName) {
  return raw(intervalName === 'week' ? 'interval.week' : 'interval.month')
}

/**
 * A typed amount ("1.234,5", "100", "12.5", "48.000") as a plain, positive
 * decimal string ("1234.5"), or null. Same reading as core/units.js
 * parseAmount (core/decimal.js), without ethers so it runs in the browser.
 */
export function normalizeAmount (value) {
  const v = plainDecimal(value)
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(v)) return null
  if (Number(v) <= 0) return null
  return v.replace(/^0+(?=\d)/, '')
}
