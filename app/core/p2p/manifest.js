/**
 * The round manifest: what the organizer publishes over Hyperswarm.
 *
 *   key 'round'          → RoundManifest
 *   key 'news/<ts>'      → { text, at }
 *
 * Only the organizer can write (single-writer Hypercore, signed). Readers still
 * treat every value as untrusted input: types and sizes are validated, and the
 * important facts (organizer, amounts, schedule) always come from the contract.
 *
 * @module core/p2p/manifest
 */
import { LIMITS } from '../config/limits.js'

/**
 * @typedef {Object} RoundManifest
 * @property {1} v
 * @property {string} title
 * @property {string} description
 * @property {string} network
 * @property {number} chainId
 * @property {string} round     - contract address
 * @property {string} organizer - must equal the contract's organizer
 * @property {string|null} guide - suggested bid per installment ("Richtwert"), display only
 * @property {number} createdAt - ms
 */

const clip = (s, n) => String(s ?? '').slice(0, n)

/**
 * @param {unknown} m
 * @returns {RoundManifest|null} A sanitized copy, or null if unusable.
 */
export function sanitizeManifest (m) {
  if (!m || typeof m !== 'object') return null
  if (!/^0x[0-9a-fA-F]{40}$/.test(m.round) || !/^0x[0-9a-fA-F]{40}$/.test(m.organizer)) return null
  if (!Number.isInteger(m.chainId)) return null
  return {
    v: 1,
    title: clip(m.title, LIMITS.title),
    description: clip(m.description, LIMITS.description),
    network: clip(m.network, 32),
    chainId: m.chainId,
    round: m.round,
    organizer: m.organizer,
    guide: typeof m.guide === 'string' && /^\d{1,15}(\.\d{1,6})?$/.test(m.guide) ? m.guide : null,
    createdAt: Number.isFinite(m.createdAt) ? m.createdAt : 0
  }
}

/**
 * @param {unknown} n
 * @returns {{ text: string, at: number }|null}
 */
export function sanitizeNews (n) {
  if (!n || typeof n !== 'object' || typeof n.text !== 'string') return null
  return { text: clip(n.text, LIMITS.news), at: Number.isFinite(n.at) ? n.at : 0 }
}

/** @param {number} at @returns {string} sortable Hyperbee key */
export function newsKey (at) {
  return 'news/' + String(at).padStart(15, '0')
}
