/**
 * Errors that are safe to show to the user. Everything the UI displays comes
 * through here; the texts live in the catalogs (i18n/).
 * @module core/errors
 */
import { t } from '../i18n/index.js'

export class PomonaError extends Error {
  /**
   * @param {string} code - Stable, machine-readable code (e.g. 'WRONG_PASSWORD').
   * @param {string} message - Human-readable message in the current language.
   */
  constructor (code, message) {
    super(message)
    this.name = 'PomonaError'
    this.code = code
  }
}

/**
 * Throws with the message `err.<key>` in the current language (i18n/).
 * @param {string} code
 * @param {string} key - key below `err` in the catalogs
 * @param {Record<string, unknown>} [params]
 * @returns {never}
 */
export function fail (code, key, params) {
  throw new PomonaError(code, t('err.' + key, params))
}
