/**
 * Amount parsing and formatting. All amounts inside the core are bigint base
 * units (USDT has 6 decimals); strings only exist at the UI/RPC boundary.
 * @module core/units
 */
import { parseUnits, formatUnits } from 'ethers'
import { fail } from './errors.js'

/**
 * Parses a user-typed amount. Accepts German and English notation:
 * "1.234,56", "1234,56", "1234.56", "48.000" (thousands) and "12,5".
 *
 * @param {string|number} value
 * @param {number} decimals
 * @param {string} [label] - Field name for the error message.
 * @returns {bigint}
 */
export function parseAmount (value, decimals, label = 'Betrag') {
  let v = String(value ?? '').trim().replace(/\s/g, '')
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '')
  if (!/^\d+(\.\d+)?$/.test(v)) fail('BAD_AMOUNT', `${label}: bitte eine Zahl eingeben.`)
  const [, frac = ''] = v.split('.')
  if (frac.length > decimals) fail('BAD_AMOUNT', `${label}: höchstens ${decimals} Nachkommastellen.`)
  return parseUnits(v, decimals)
}

/**
 * @param {bigint} units
 * @param {number} decimals
 * @returns {string} Plain decimal string without trailing ".0" (e.g. "1234.5").
 */
export function formatAmount (units, decimals) {
  const s = formatUnits(units, decimals)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}
