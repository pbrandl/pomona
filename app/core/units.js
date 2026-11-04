/**
 * Amount parsing and formatting. All amounts inside the core are bigint base
 * units (USDT has 6 decimals); strings only exist at the UI/RPC boundary.
 * @module core/units
 */
import { parseUnits, formatUnits } from 'ethers'
import { fail } from './errors.js'
import { t } from '../i18n/index.js'
import { plainDecimal } from './decimal.js'

/**
 * Parses a user-typed amount. Accepts German and English notation:
 * "1.234,56", "1234,56", "1234.56", "48.000" (thousands) and "12,5".
 *
 * @param {string|number} value
 * @param {number} decimals
 * @param {string} [label] - Field key (i18n label.*) for the error message.
 * @returns {bigint}
 */
export function parseAmount (value, decimals, label = 'amount') {
  const v = plainDecimal(value)
  if (!/^\d+(\.\d+)?$/.test(v)) fail('BAD_AMOUNT', 'notANumber', { label: t('label.' + label) })
  const [, frac = ''] = v.split('.')
  if (frac.length > decimals) fail('BAD_AMOUNT', 'tooManyDecimals', { label: t('label.' + label), decimals })
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
