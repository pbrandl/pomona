/**
 * Tiny German formatting helpers for the assistant. Pure JS without Intl, so
 * they behave the same in Bare (worker), Node (tests) and the browser (mock).
 * @module core/agent/words
 */
import { plainDecimal } from '../decimal.js'

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/** 1234.5 → "1.234,5" (max. 2 decimals) */
export function num (value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  const [int, frac = ''] = (Math.round(n * 100) / 100).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const f = frac.replace(/0+$/, '')
  return f ? `${grouped},${f}` : grouped
}

/** unix seconds → "12. November 2026" (UTC, stable across runtimes) */
export function day (t) {
  const d = new Date(t * 1000)
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "noch 12 Tage" / "noch 5 Stunden" / "vorbei" */
export function until (t, now) {
  const s = t - now
  if (s <= 0) return 'vorbei'
  if (s >= 2 * 86400) return `noch ${Math.floor(s / 86400)} Tage`
  if (s >= 3600) return `noch ${Math.floor(s / 3600)} Stunden`
  return `noch ${Math.max(1, Math.floor(s / 60))} Minuten`
}

/** "pro Monat" / "pro Woche" and the adjective */
export function per (intervalName) {
  return intervalName === 'week'
    ? { per: 'pro Woche', adj: 'wöchentlich', unit: 'Woche' }
    : { per: 'pro Monat', adj: 'monatlich', unit: 'Monat' }
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
