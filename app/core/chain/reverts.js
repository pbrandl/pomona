/**
 * Maps contract reverts to user-facing messages.
 * @module core/chain/reverts
 */
import { Interface } from 'ethers'
import abi from './abi.js'
import { PomonaError } from '../errors.js'

const iface = new Interface([...abi.PomonaRound, ...abi.PomonaFactory].filter((f) => f.type === 'error'))

const MESSAGES = {
  WrongPhase: 'Das ist in der aktuellen Phase der Runde nicht möglich.',
  NotOrganizer: 'Nur der Organisator darf das.',
  ZeroAmount: 'Bitte einen Betrag eingeben.',
  BelowMinBid: 'Das Gebot liegt unter dem Mindestgebot.',
  InvalidInvite: 'Die Einladung ist ungültig.',
  TooMuch: 'Mehr als dein Gebot kann nicht zurückgezogen werden.',
  NotDue: 'Die nächste Rechnung ist noch nicht fällig.',
  NothingToRefund: 'Es gibt nichts zurückzuzahlen.',
  UnsupportedToken: 'Dieser Token wird nicht unterstützt.',
  BadParams: 'Ungültige Angaben für die Runde.',
  WrongMode: 'Das passt nicht zur Art, wie in dieser Runde bezahlt wird.',
  NotIssued: 'Diese Rechnung ist noch nicht da.',
  NotBidder: 'Du hast in dieser Runde nicht geboten.',
  AlreadyPaid: 'Diese Rechnung ist schon bezahlt.'
}

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
  if (name && MESSAGES[name]) return new PomonaError('REVERT_' + name, MESSAGES[name])
  return /** @type {Error} */ (e)
}
