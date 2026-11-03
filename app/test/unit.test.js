// Fast tests without chain or network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { Interface, Wallet } from 'ethers'
import { parseAmount, formatAmount } from '../core/units.js'
import { encodeInvite, decodeInvite, encodeReceipt, decodeReceipt } from '../core/links.js'
import { dueAt, expiresAt, canInvoice, INTERVALS } from '../core/schedule.js'
import { isAllowedCall } from '../core/wallet/policy.js'
import { seal, open } from '../core/wallet/vault.js'
import { sanitizeManifest } from '../core/p2p/manifest.js'
import { serve, validate } from '../core/rpc/server.js'
import { METHODS } from '../core/rpc/methods.js'
import abi from '../core/chain/abi.js'

const A = (n) => '0x' + String(n).repeat(40).slice(0, 40)

test('amounts: German and English notation', () => {
  assert.equal(parseAmount('48.000', 6), 48_000_000000n)
  assert.equal(parseAmount('1.234,56', 6), 1234_560000n)
  assert.equal(parseAmount('12,5', 6), 12_500000n)
  assert.equal(parseAmount('12.5', 6), 12_500000n)
  assert.equal(parseAmount(' 100 ', 6), 100_000000n)
  assert.throws(() => parseAmount('1,0000001', 6), /Nachkommastellen/)
  assert.throws(() => parseAmount('-5', 6), /Zahl/)
  assert.throws(() => parseAmount('1e6', 6), /Zahl/)
  assert.equal(formatAmount(1234_500000n, 6), '1234.5')
  assert.equal(formatAmount(100_000000n, 6), '100')
})

test('invite links round-trip and reject tampering', () => {
  const inv = { manifest: 'a'.repeat(64), network: 'local', round: A(1), inviteKey: '0x' + 'b'.repeat(64) }
  assert.deepEqual(decodeInvite(encodeInvite(inv)), inv)
  assert.deepEqual(decodeInvite(encodeInvite({ ...inv, inviteKey: null })), { ...inv, inviteKey: null })
  assert.throws(() => decodeInvite('https://example.com'), /kein Einladungslink/)
  assert.throws(() => decodeInvite('pomona://abc'), /beschädigt/)
  assert.throws(() => decodeInvite(encodeInvite({ ...inv, round: 'evil' })), /ungültig/)
  assert.throws(() => decodeInvite('pomona://' + 'x'.repeat(5000)), /zu lang/)
})

test('receipt codes round-trip and validate', () => {
  const r = { network: 'sepolia', round: A(2), bidder: A(3), index: 4, at: 1700000000, owner: A(4), sig: '0x' + 'ab'.repeat(65) }
  assert.deepEqual(decodeReceipt(encodeReceipt(r)), r)
  assert.throws(() => decodeReceipt(encodeReceipt({ ...r, index: -1 })), /ungültig/)
  assert.throws(() => decodeReceipt(encodeReceipt({ ...r, sig: '0x12' })), /ungültig/) // unsigned receipts are not accepted
  assert.throws(() => decodeReceipt(encodeInvite({ manifest: 'a'.repeat(64), network: 'x', round: A(1) })), /kein Beleg/)
})

test('schedule mirrors the contract rules', () => {
  const info = { biddingEnd: 1000, interval: INTERVALS.month, installments: 3, invoiceCount: 1, phase: 'running' }
  assert.equal(dueAt(info, 1), 1000 + INTERVALS.month)
  assert.equal(expiresAt(info), 1000 + 3 * INTERVALS.month)
  assert.equal(canInvoice(info, 1000 + INTERVALS.month - 1), false)
  assert.equal(canInvoice(info, 1000 + INTERVALS.month), true)
  assert.equal(canInvoice({ ...info, invoiceCount: 3 }, 1e12), false)
  assert.equal(canInvoice({ ...info, phase: 'completed' }, 1000 + INTERVALS.month), false)
})

test('wallet policy: only USDT approvals to the round, the round, and createRound', () => {
  const token = A(1); const factory = A(2); const round = A(3); const attacker = A(9)
  const t = { token: () => token, factory: () => factory, round: () => round }
  const erc20 = new Interface(abi.ERC20)
  const fac = new Interface(abi.PomonaFactory)
  const rnd = new Interface(abi.PomonaRound)
  const call = (to, data, value = 0n) => ({ to, data, value })
  assert.equal(isAllowedCall(call(token, erc20.encodeFunctionData('approve', [round, 5n])), t), true)
  assert.equal(isAllowedCall(call(token, erc20.encodeFunctionData('approve', [attacker, 5n])), t), false)
  assert.equal(isAllowedCall(call(token, erc20.encodeFunctionData('transfer', [attacker, 5n])), t), false)
  assert.equal(isAllowedCall(call(round, rnd.encodeFunctionData('invoice', [])), t), true)
  assert.equal(isAllowedCall(call(round, rnd.encodeFunctionData('pay', [0])), t), true)
  assert.equal(isAllowedCall(call(factory, fac.encodeFunctionData('createRound', [1, 1n, 0n, 1n, 1n, 1, attacker])), t), true)
  assert.equal(isAllowedCall(call(factory, '0xdeadbeef'), t), false)
  assert.equal(isAllowedCall(call(attacker, '0x'), t), false)
  assert.equal(isAllowedCall(call(round, '0x', 1n), t), false) // no native value
  const noRound = { ...t, round: () => null }
  assert.equal(isAllowedCall(call(token, erc20.encodeFunctionData('approve', [round, 5n])), noRound), false)
})

test('vault: seed is only readable with the password', () => {
  const seed = Wallet.createRandom().mnemonic.phrase
  const sealed = seal(seed, 'richtig-lang')
  assert.ok(!JSON.stringify(sealed).includes(seed.split(' ')[0] + ' '))
  assert.equal(open(sealed, 'richtig-lang'), seed)
  assert.throws(() => open(sealed, 'falsch-lang'), /Falsches Passwort/)
  assert.throws(() => seal(seed, 'kurz'), /mindestens 8/)
  const tampered = { ...sealed, box: sealed.box.slice(0, -2) + (sealed.box.endsWith('00') ? '01' : '00') }
  assert.throws(() => open(tampered, 'richtig-lang'), /Falsches Passwort/)
})

test('manifest from peers is sanitized', () => {
  const m = sanitizeManifest({ title: 'x'.repeat(10000), description: 5, round: A(1), organizer: A(2), chainId: 1, extra: '<script>' })
  assert.equal(m.title.length, 120)
  assert.equal(m.description, undefined) // older manifests: no longer part of a round
  assert.equal(m.extra, undefined)
  assert.equal(sanitizeManifest({ round: 'nope', organizer: A(2), chainId: 1 }), null)
  assert.equal(sanitizeManifest('string'), null)
})

test('rpc: unknown methods and bad params are rejected', async () => {
  assert.throws(() => validate({ amount: 'amount' }, { amount: { evil: true } }), /Ungültiger Parameter/)
  assert.throws(() => validate({ password: ['string', 4] }, { password: 'zulang' }), /Ungültiger Parameter/)
  assert.deepEqual(validate({ amount: 'amount' }, { amount: 5, extra: 1 }), { amount: '5' })

  const stream = new PassThrough()
  const calls = []
  const fake = { status: () => ({ ok: true }), revealSeed: (p) => { calls.push(p); return 'x' } }
  const replies = []
  const out = new PassThrough()
  const duplex = { on: (ev, fn) => stream.on(ev, fn), write: (s) => { out.write(s); replies.push(JSON.parse(s)) } }
  serve(duplex, fake, METHODS)
  stream.write(JSON.stringify({ id: 1, method: 'status' }) + '\n')
  stream.write(JSON.stringify({ id: 2, method: '__proto__' }) + '\n')
  stream.write(JSON.stringify({ id: 3, method: 'constructor' }) + '\n')
  stream.write(JSON.stringify({ id: 4, method: 'revealSeed', params: { password: 123 } }) + '\n')
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(replies.find((r) => r.id === 1).result, { ok: true })
  assert.equal(replies.find((r) => r.id === 2).error.code, 'NO_METHOD')
  assert.equal(replies.find((r) => r.id === 3).error.code, 'NO_METHOD')
  assert.equal(replies.find((r) => r.id === 4).error.code, 'BAD_PARAMS')
  assert.equal(calls.length, 0)
})

test('QVAC: hand-downloaded model file is used only with the right size and SHA-256', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createHash } = await import('node:crypto')
  const { QvacEngine } = await import('../core/agent/qvac.js')
  const dir = mkdtempSync(join(tmpdir(), 'pomona-models-'))
  try {
    const data = Buffer.from('gguf-test-model')
    const good = { modelId: 'm.gguf', expectedSize: data.length, sha256Checksum: createHash('sha256').update(data).digest('hex') }
    const engine = new QvacEngine({ cacheDir: join(dir, 'cache'), localDir: dir })
    assert.equal(await engine._localFile(good, () => {}), null) // missing: fall back to the registry
    const strict = new QvacEngine({ cacheDir: join(dir, 'cache'), localDir: dir, localOnly: true })
    await assert.rejects(strict._localFile(good, () => {}), /Modelldatei fehlt/)
    writeFileSync(join(dir, 'm.gguf'), data)
    assert.equal(await engine._localFile(good, () => {}), join(dir, 'm.gguf'))
    assert.equal(await engine._localFile(good, () => {}), join(dir, 'm.gguf')) // cached check
    await assert.rejects(engine._localFile({ ...good, sha256Checksum: '00'.repeat(32) }, () => {}), /Prüfsumme/)
    await assert.rejects(engine._localFile({ ...good, expectedSize: 999 }, () => {}), /falsche Größe/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bid statistics: average and median per installment', async () => {
  const { bidStats } = await import('../core/pomona.js')
  const f = (v) => String(v)
  assert.deepEqual(bidStats([], f), { average: null, median: null })
  assert.deepEqual(bidStats([100n, 50n, 300n], f), { average: '150', median: '100' })
  assert.deepEqual(bidStats([40n, 10n, 20n, 30n], f), { average: '25', median: '25' })
})

test('project website: only plain http(s) addresses survive', async () => {
  const { cleanWebsite } = await import('../core/p2p/manifest.js')
  assert.equal(cleanWebsite('lindenhof.de'), 'https://lindenhof.de/')
  assert.equal(cleanWebsite('https://solawi.example/runde?x=1'), 'https://solawi.example/runde?x=1')
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@evil.example', 'ftp://x.example', 'localhost', '', null, 'x'.repeat(400) + '.de']) {
    assert.equal(cleanWebsite(bad), null, String(bad).slice(0, 40))
  }
})
