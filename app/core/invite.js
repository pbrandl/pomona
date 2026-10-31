// Invite links: pomona://<base64url payload>
// The payload carries everything a bidder needs and nothing else:
//   m  – Hypercore key of the organizer's round manifest (Pears)
//   n  – network id (see networks.js)
//   r  – round contract address
//   k  – invite private key (only for invite-only rounds). Whoever holds the
//        link can sign their own address with it; the contract checks it.
import b4a from 'b4a'

const PREFIX = 'pomona://'

export function encodeInvite ({ manifest, network, round, inviteKey = null }) {
  const payload = { v: 1, m: manifest, n: network, r: round }
  if (inviteKey) payload.k = inviteKey
  return PREFIX + b4a.toString(b4a.from(JSON.stringify(payload)), 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeInvite (link) {
  link = String(link).trim()
  if (!link.startsWith(PREFIX)) throw new Error('Kein Pomona-Link')
  const b64 = link.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
  let payload
  try {
    payload = JSON.parse(b4a.toString(b4a.from(b64, 'base64')))
  } catch {
    throw new Error('Link ist beschädigt')
  }
  if (payload.v !== 1 || !/^[0-9a-f]{64}$/.test(payload.m) || !/^0x[0-9a-fA-F]{40}$/.test(payload.r)) {
    throw new Error('Link ist ungültig')
  }
  return { manifest: payload.m, network: payload.n, round: payload.r, inviteKey: payload.k || null }
}
