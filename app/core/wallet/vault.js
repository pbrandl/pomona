/**
 * Seed vault: the recovery phrase is stored only encrypted.
 *
 *   key  = Argon2id(password, salt)            (libsodium crypto_pwhash)
 *   box  = XSalsa20-Poly1305(seed, nonce, key)  (libsodium crypto_secretbox)
 *
 * The KDF parameters are stored next to the ciphertext so they can be raised
 * later without breaking existing vaults. Works in Node and Bare
 * (sodium-universal resolves to sodium-native in both).
 *
 * @module core/wallet/vault
 */
import sodium from 'sodium-universal'
import b4a from 'b4a'
import { fail } from '../errors.js'
import { LIMITS } from '../config/limits.js'

/**
 * @typedef {Object} SealedSeed
 * @property {1} v
 * @property {'argon2id13'} kdf
 * @property {number} ops
 * @property {number} mem
 * @property {string} salt  - hex
 * @property {string} nonce - hex
 * @property {string} box   - hex
 */

const OPS = sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE
const MEM = sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE

/** @param {string} password */
export function checkPassword (password) {
  if (typeof password !== 'string' || password.length < LIMITS.password.min) {
    fail('WEAK_PASSWORD', 'passwordShort', { min: LIMITS.password.min })
  }
  if (password.length > LIMITS.password.max) fail('WEAK_PASSWORD', 'passwordLong')
}

function deriveKey (password, salt, ops, mem) {
  const key = b4a.alloc(sodium.crypto_secretbox_KEYBYTES)
  sodium.crypto_pwhash(key, b4a.from(password, 'utf-8'), salt, ops, mem, sodium.crypto_pwhash_ALG_ARGON2ID13)
  return key
}

/**
 * @param {string} seed
 * @param {string} password
 * @returns {SealedSeed}
 */
export function seal (seed, password) {
  checkPassword(password)
  const salt = b4a.alloc(sodium.crypto_pwhash_SALTBYTES)
  const nonce = b4a.alloc(sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(salt)
  sodium.randombytes_buf(nonce)
  const key = deriveKey(password, salt, OPS, MEM)
  const msg = b4a.from(seed, 'utf-8')
  const box = b4a.alloc(msg.byteLength + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(box, msg, nonce, key)
  sodium.sodium_memzero(key)
  sodium.sodium_memzero(msg)
  return {
    v: 1,
    kdf: 'argon2id13',
    ops: OPS,
    mem: MEM,
    salt: b4a.toString(salt, 'hex'),
    nonce: b4a.toString(nonce, 'hex'),
    box: b4a.toString(box, 'hex')
  }
}

/**
 * @param {SealedSeed} sealed
 * @param {string} password
 * @returns {string} The seed phrase.
 * @throws {PomonaError} WRONG_PASSWORD
 */
export function open (sealed, password) {
  if (!sealed || sealed.v !== 1 || sealed.kdf !== 'argon2id13') fail('VAULT_FORMAT', 'vaultFormat')
  if (typeof password !== 'string' || password.length > LIMITS.password.max) fail('WRONG_PASSWORD', 'wrongPassword')
  const box = b4a.from(sealed.box, 'hex')
  const key = deriveKey(password, b4a.from(sealed.salt, 'hex'), sealed.ops, sealed.mem)
  const msg = b4a.alloc(box.byteLength - sodium.crypto_secretbox_MACBYTES)
  const ok = sodium.crypto_secretbox_open_easy(msg, box, b4a.from(sealed.nonce, 'hex'), key)
  sodium.sodium_memzero(key)
  if (!ok) fail('WRONG_PASSWORD', 'wrongPassword')
  const seed = b4a.toString(msg, 'utf-8')
  sodium.sodium_memzero(msg)
  return seed
}
