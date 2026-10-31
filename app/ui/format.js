/**
 * Formatting helpers for the UI. Everything that ends up in innerHTML goes
 * through `esc` unless it is markup we generated ourselves (QR SVGs, icons).
 * @module ui/format
 */

/** HTML-escapes any value. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** "1234.5" → "1.234,5" */
export const fmt = (n, max = 2) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: max })

/** 0x1234…abcd */
export const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '')

/** Unix seconds → "12. November 2026" */
export const date = (t) => new Date(t * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })

/** Unix seconds → "12. Nov." */
export const shortDate = (t) => new Date(t * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })

/** ms → "12.11.2026, 14:00" */
export const dateTime = (ms) => new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Wording for the billing interval. */
export function per (intervalName) {
  return intervalName === 'week'
    ? { unit: 'Woche', adj: 'wöchentlich', plural: 'Wochen', per: 'pro Woche' }
    : { unit: 'Monat', adj: 'monatlich', plural: 'Monate', per: 'pro Monat' }
}

/** Accepts "48.000", "1.234,56", "12,5" → Number (UI previews only; the core parses for real). */
export function num (v) {
  v = String(v ?? '').trim().replace(/\s/g, '')
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '')
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Remaining time until `t` (unix seconds) from `now`. */
export function left (t, now) {
  const s = t - now
  if (s <= 0) return { value: '0', unit: 'vorbei' }
  if (s >= 86400 * 2) return { value: String(Math.floor(s / 86400)), unit: 'Tage übrig' }
  if (s >= 3600) return { value: String(Math.floor(s / 3600)), unit: 'Std. übrig' }
  return { value: String(Math.max(1, Math.floor(s / 60))), unit: 'Min. übrig' }
}
