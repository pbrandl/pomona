/**
 * Errors that are safe to show to the user. Everything the UI displays comes
 * through here, so messages stay consistent and in one language.
 * @module core/errors
 */

export class PomonaError extends Error {
  /**
   * @param {string} code - Stable, machine-readable code (e.g. 'WRONG_PASSWORD').
   * @param {string} message - Human-readable German message.
   */
  constructor (code, message) {
    super(message)
    this.name = 'PomonaError'
    this.code = code
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {never}
 */
export function fail (code, message) {
  throw new PomonaError(code, message)
}
