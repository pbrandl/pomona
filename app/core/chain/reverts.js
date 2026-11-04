/**
 * Maps contract reverts to user-facing messages.
 * @module core/chain/reverts
 */
import { Interface } from 'ethers'
import abi from './abi.js'
import { PomonaError } from '../errors.js'
import { t, raw } from '../../i18n/index.js'

const iface = new Interface([...abi.PomonaRound, ...abi.PomonaFactory].filter((f) => f.type === 'error'))

/**
 * Finds the first custom error of our contracts anywhere inside a provider
 * error (providers nest revert data differently).
 * @param {unknown} e
 * @returns {string|null}
 */
function revertName (e, seen = new Set()) {
  if (!e || typeof e !== 'object' || seen.has(e)) return null
  seen.add(e)
  for (const v of Object.values(e)) {
    if (typeof v === 'string' && /^0x[0-9a-f]{8}/i.test(v)) {
      try {
        const parsed = iface.parseError(v)
        if (parsed) return parsed.name
      } catch {}
    }
    const nested = revertName(v, seen)
    if (nested) return nested
  }
  return null
}

/**
 * @param {unknown} e
 * @returns {Error} A PomonaError for known reverts, otherwise `e` unchanged.
 */
export function explain (e) {
  const name = revertName(e)
  if (name && raw('revert.' + name)) return new PomonaError('REVERT_' + name, t('revert.' + name))
  return /** @type {Error} */ (e)
}
