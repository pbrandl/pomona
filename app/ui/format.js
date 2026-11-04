/**
 * Formatting helpers for the UI. Everything that ends up in innerHTML goes
 * through `esc` unless it is markup we generated ourselves (QR SVGs, icons).
 * @module ui/format
 */
import { raw, locale } from '../i18n/index.js'

/** HTML-escapes any value. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** "1234.5" → "1.234,5" (one number style in every language, the same the input accepts) */
export const fmt = (n, max = 2) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: max })

/** 0x1234…abcd */
export const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '')

/** Unix seconds → "12. November 2026" */
export const date = (t) => new Date(t * 1000).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })

/** Unix seconds → "12. November 2026, 23:59" */
export const dayTime = (t) => new Date(t * 1000).toLocaleString(locale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Unix seconds → "2026-11-12" (value of <input type="date">) */
export const isoDay = (t) => {
  const d = new Date(t * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-11-12" → unix seconds of 23:59:59 local time that day, or null. */
export const endOfDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  return Math.floor(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime() / 1000)
}

/** Unix seconds → "12. Nov." */
export const shortDate = (t) => new Date(t * 1000).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })

/** ms → "12.11.2026, 14:00" */
export const dateTime = (ms) => new Date(ms).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })

/** Wording for the billing interval: { unit, adj, plural, per } (i18n interval.*). */
export function per (intervalName) {
  return raw(intervalName === 'week' ? 'interval.week' : 'interval.month')
}

/**
 * Accepts "48.000", "1.234,56", "12,5" → Number, for previews only; the core
 * parses for real (same rule as core/decimal.js, which the renderer does not load).
 */
export function num (v) {
  v = String(v ?? '').trim().replace(/\s/g, '')
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '')
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
