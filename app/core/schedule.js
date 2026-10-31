/**
 * Pure helpers around the invoice schedule of a round. They mirror the rules
 * in PomonaRound.sol so the UI can explain what is possible and when.
 * @module core/schedule
 */

export const DAY = 86400

/**
 * Billing intervals offered by the app. The contract accepts any interval
 * between 1 and 366 days; a "month" is a fixed 30 days on-chain.
 */
export const INTERVALS = Object.freeze({
  week: 7 * DAY,
  month: 30 * DAY
})

/** Phase names as returned by the contract's `phase()` (enum order). */
export const PHASES = Object.freeze(['bidding', 'failed', 'running', 'completed'])

/**
 * @param {number} seconds
 * @returns {'week'|'month'|null}
 */
export function intervalName (seconds) {
  for (const [name, s] of Object.entries(INTERVALS)) if (s === seconds) return name
  return null
}

/**
 * @typedef {Object} ScheduleInfo
 * @property {number} biddingEnd   - unix seconds
 * @property {number} interval     - seconds
 * @property {number} installments - how often the organizer may invoice
 * @property {number} invoiceCount - how often the organizer has invoiced
 */

/**
 * @param {ScheduleInfo} info
 * @param {number} index - 0-based invoice index
 * @returns {number} Earliest unix time invoice `index` may be issued.
 */
export function dueAt (info, index) {
  return info.biddingEnd + info.interval * index
}

/**
 * @param {ScheduleInfo} info
 * @returns {number} After this, no invoice can be issued any more.
 */
export function expiresAt (info) {
  return info.biddingEnd + info.interval * info.installments
}

/**
 * @param {ScheduleInfo & { phase: string }} info
 * @param {number} now - unix seconds (chain time)
 * @returns {boolean} Whether the organizer can invoice right now.
 */
export function canInvoice (info, now) {
  return info.phase === 'running' &&
    info.invoiceCount < info.installments &&
    now >= dueAt(info, info.invoiceCount) &&
    now < expiresAt(info)
}
