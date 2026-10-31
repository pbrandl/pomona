/**
 * Shareable codes.
 *
 *   Invite  pomona://<payload>        shared by the organizer
 *   Receipt pomona-beleg://<payload>  proof that a bidder paid an installment
 *
 * Payloads are base64url-encoded JSON. They are untrusted input: everything is
 * validated here, and everything that matters is re-checked on-chain.
 *
 * @module core/links
 */
import b4a from 'b4a'
import { fail } from './errors.js'
import { LIMITS } from './config/limits.js'

const INVITE = 'pomona://'
const RECEIPT = 'pomona-beleg://'

const isAddress = (s) => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s)
const isNetworkId = (s) => typeof s === 'string' && /^[a-z0-9-]{1,32}$/.test(s)

function pack (prefix, obj) {
  return prefix + b4a.toString(b4a.from(JSON.stringify(obj)), 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unpack (prefix, code, what) {
  code = String(code ?? '').trim()
  if (code.length > LIMITS.link) fail('BAD_LINK', `${what} ist zu lang.`)
  if (!code.startsWith(prefix)) fail('BAD_LINK', `Das ist kein ${what}.`)
  try {
    const json = b4a.toString(b4a.from(code.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
    const obj = JSON.parse(json)
    if (obj && typeof obj === 'object' && obj.v === 1) return obj
  } catch {}
  return fail('BAD_LINK', `${what} ist beschädigt.`)
}

/**
 * @typedef {Object} Invite
 * @property {string} manifest - hex key of the organizer's Hypercore
 * @property {string} network  - network id
 * @property {string} round    - round contract address
 * @property {string|null} inviteKey - private key that admits bidders (invite-only rounds)
 */

/** @param {Invite} i @returns {string} */
export function encodeInvite (i) {
  const p = { v: 1, m: i.manifest, n: i.network, r: i.round }
  if (i.inviteKey) p.k = i.inviteKey
  return pack(INVITE, p)
}

/** @param {string} link @returns {Invite} */
export function decodeInvite (link) {
  const p = unpack(INVITE, link, 'Einladungslink')
  if (!/^[0-9a-f]{64}$/.test(p.m) || !isNetworkId(p.n) || !isAddress(p.r)) fail('BAD_LINK', 'Einladungslink ist ungültig.')
  if (p.k !== undefined && !/^0x[0-9a-f]{64}$/i.test(p.k)) fail('BAD_LINK', 'Einladungslink ist ungültig.')
  return { manifest: p.m, network: p.n, round: p.r, inviteKey: p.k || null }
}

/**
 * @typedef {Object} Receipt
 * @property {string} network
 * @property {string} round
 * @property {string} bidder
 * @property {number} index - 0-based installment
 */

/** @param {Receipt} r @returns {string} */
export function encodeReceipt (r) {
  return pack(RECEIPT, { v: 1, n: r.network, r: r.round, b: r.bidder, i: r.index })
}

/** @param {string} code @returns {Receipt} */
export function decodeReceipt (code) {
  const p = unpack(RECEIPT, code, 'Beleg')
  if (!isNetworkId(p.n) || !isAddress(p.r) || !isAddress(p.b) || !Number.isInteger(p.i) || p.i < 0 || p.i >= LIMITS.maxInstallments) {
    fail('BAD_LINK', 'Beleg ist ungültig.')
  }
  return { network: p.n, round: p.r, bidder: p.b, index: p.i }
}
