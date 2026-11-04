/**
 * How Pomona reads typed amounts, in one place for the whole core:
 * German style "1.234,5" → "1234.5", "12,5" → "12.5", "48.000" → "48000", "12.5" → "12.5";
 * English style (language en) "1,234.5" → "1234.5", "48,000" → "48000".
 * No dependencies, so it runs in Bare, Node and the browser (design preview).
 * The UI has its own copy for previews (ui/format.js num): the renderer does
 * not load core code.
 * @module core/decimal
 */
import { separators } from '../i18n/index.js'

/** Typed number in the style of the current language → plain decimal string (not validated). */
export function plainDecimal (value) {
  let v = String(value ?? '').trim().replace(/\s/g, '')
  if (separators().decimal === '.') return v.replace(/,/g, '')
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '')
  return v
}
