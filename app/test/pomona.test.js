import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'
import { encodeInvite, decodeInvite } from '../core/invite.js'

let env
before(async () => { env = await setup() })
after(async () => { await env.teardown() })

test('invite links round-trip and reject garbage', () => {
  const inv = { manifest: 'a'.repeat(64), network: 'local', round: '0x' + '1'.repeat(40), inviteKey: '0x' + '2'.repeat(64) }
  assert.deepEqual(decodeInvite(encodeInvite(inv)), inv)
  assert.throws(() => decodeInvite('https://example.com'), /Kein Pomona-Link/)
  assert.throws(() => decodeInvite('pomona://abc'), /beschädigt|ungültig/)
})

test('full round over Pears + WDK + escrow: create, join, bid, withdraw, claim', async () => {
  const farm = await env.make()
  const alice = await env.make()
  const bob = await env.make()
  for (const p of [farm, alice, bob]) {
    await p.createWallet()
    await p.faucet()
  }
  const w = (await alice.status()).wallet
  assert.equal(w.token, '5000.0')
  assert.equal(w.native, '1.0')

  // Organizer creates an invite-only round.
  const { link } = await farm.createRound({
    title: 'Solawi Lindenhof 2027', description: 'Gemüse für 40 Haushalte', target: '1000', days: 7, minBid: '10', inviteOnly: true
  })
  assert.match(link, /^pomona:\/\//)
  let s = await farm.status()
  assert.equal(s.round.role, 'organizer')
  assert.equal(s.round.verified, true)
  assert.equal(s.round.inviteOnly, true)
  assert.equal(s.round.target, '1000.0')
  await farm.postNews('Willkommen zur Bietrunde!')

  // Bidders get the manifest peer-to-peer from the organizer.
  await alice.join(link)
  s = await alice.status()
  assert.equal(s.round.role, 'bidder')
  assert.equal(s.round.title, 'Solawi Lindenhof 2027')
  assert.equal(s.round.verified, true)
  assert.equal(s.round.news[0].text, 'Willkommen zur Bietrunde!')

  // Bob joins while the organizer is offline: Alice seeds the manifest.
  await farm.p2p.swarm.leave(farm.p2p.manifest.core.discoveryKey)
  for (const c of farm.p2p.swarm.connections) c.destroy()
  await bob.join(link)
  assert.equal((await bob.status()).round.title, 'Solawi Lindenhof 2027')

  await alice.bid('600')
  await bob.bid('300')
  await bob.bid('150,50') // raise, German decimal comma
  s = await bob.status()
  assert.equal(s.round.total, '1050.5')
  assert.equal(s.round.myPledge, '450.5')
  assert.equal(s.round.bidders, 2)
  assert.equal(s.round.progress, 1.0505)

  await bob.withdraw('50')
  assert.equal((await bob.status()).round.myPledge, '400.5')
  await assert.rejects(bob.withdraw('395'), /Mindestgebot/)
  await assert.rejects(alice.claim(), /Nur der Organisator|nicht/)
  await assert.rejects(farm.claim(), /nicht erreicht/)

  await env.warp(8 * 86400)
  s = await farm.status()
  assert.equal(s.round.state, 'succeeded')
  await assert.rejects(alice.bid('10'), /nicht mehr offen/)
  await farm.claim()
  s = await farm.status()
  assert.equal(s.round.claimed, true)
  assert.equal(s.wallet.token, String(5000 + 1000.5)) // 600 + 400.5
})

test('someone without the invite key cannot bid', async () => {
  const farm = await env.make()
  const eve = await env.make()
  for (const p of [farm, eve]) { await p.createWallet(); await p.faucet() }
  const { link } = await farm.createRound({ title: 'Geheim', target: '100', days: 1, inviteOnly: true })
  const inv = decodeInvite(link)
  // Eve got hold of the round but not the invite key.
  await eve.join(encodeInvite({ ...inv, inviteKey: null }))
  await assert.rejects(eve.bid('50'), /Einladung/)
})

test('failed round refunds bidders', async () => {
  const farm = await env.make()
  const carol = await env.make()
  for (const p of [farm, carol]) { await p.createWallet(); await p.faucet() }
  const { link } = await farm.createRound({ title: 'Zu ambitioniert', target: '100000', days: 2, inviteOnly: false })
  await carol.join(link)
  await carol.bid('250')
  assert.equal((await carol.status()).wallet.token, '4750.0')
  await env.warp(3 * 86400)
  assert.equal((await carol.status()).round.state, 'failed')
  await assert.rejects(farm.claim(), /nicht erreicht/)
  await carol.refund()
  assert.equal((await carol.status()).wallet.token, '5000.0')
})

test('wallet survives a restart and restores from seed', async () => {
  const a = await env.make()
  const { address } = await a.createWallet()
  const seed = a.revealSeed()
  assert.equal(seed.split(' ').length, 12)
  const b = await env.make()
  assert.equal((await b.restoreWallet(seed.toUpperCase())).address, address)
  await assert.rejects(b.restoreWallet('nicht gültig'), /ungültig/)
})
