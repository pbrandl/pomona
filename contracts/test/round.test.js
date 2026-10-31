import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Wallet, ZeroAddress, Interface } from 'ethers'
import { chain, deploy, at, signInvite, artifact } from './helpers.js'

const USDT = (n) => BigInt(n) * 1_000_000n
const DAY = 86400
const State = { Open: 0n, Succeeded: 1n, Failed: 2n }

let env, usdt, factory, organizer, alice, bob, mallory

async function newRound ({ target = USDT(1000), minBid = USDT(10), invite = null, days = 7 } = {}) {
  const deadline = (await env.now()) + days * DAY
  const signer = invite ? new Wallet(invite).address : ZeroAddress
  const tx = await factory.connect(organizer).createRound(await usdt.getAddress(), target, deadline, minBid, signer)
  const rcpt = await tx.wait()
  const ev = rcpt.logs.map(l => factory.interface.parseLog(l)).find(e => e?.name === 'RoundCreated')
  return at('PomonaRound', ev.args.round, organizer)
}

async function bid (round, who, amount, sig = '0x') {
  await (await usdt.connect(who).approve(await round.getAddress(), amount)).wait()
  return (await round.connect(who).bid(amount, sig)).wait()
}

const iface = new Interface([...artifact('PomonaRound').abi, ...artifact('PomonaFactory').abi])

// Walks the provider error and returns the first custom error our ABI knows.
function revertError (e, seen = new Set()) {
  if (!e || typeof e !== 'object' || seen.has(e)) return null
  seen.add(e)
  for (const v of Object.values(e)) {
    if (typeof v === 'string' && /^0x[0-9a-f]{8}/i.test(v)) {
      try { const parsed = iface.parseError(v); if (parsed) return parsed.name } catch {}
    }
    const found = revertError(v, seen)
    if (found) return found
  }
  return null
}

// Asserts that `p` reverts with the custom error `name`.
async function rejects (p, name) {
  await assert.rejects(p, (e) => {
    assert.equal(revertError(e), name, e.message)
    return true
  })
}

describe('PomonaRound', () => {
  before(async () => {
    env = await chain()
    ;[organizer, alice, bob, mallory] = env.signers
    usdt = await deploy('MockUSDT', organizer)
    factory = await deploy('PomonaFactory', organizer)
    for (const s of [alice, bob, mallory]) await (await usdt.mint(await s.getAddress(), USDT(10000))).wait()
  })
  after(() => env.close())

  test('successful round: bid, raise, claim', async () => {
    const round = await newRound()
    await bid(round, alice, USDT(600))
    await bid(round, bob, USDT(300))
    await bid(round, bob, USDT(150)) // raise
    assert.equal(await round.total(), USDT(1050))
    assert.equal(await round.bidderCount(), 2n)
    assert.equal(await round.pledgeOf(await bob.getAddress()), USDT(450))
    assert.equal(await round.state(), State.Open)

    await rejects(round.claim(), 'NotSucceeded')
    await env.warp(8 * DAY)
    assert.equal(await round.state(), State.Succeeded)
    await rejects(round.connect(alice).claim(), 'NotOrganizer')
    await rejects(round.connect(alice).refund(), 'NotFailed')

    const before = await usdt.balanceOf(await organizer.getAddress())
    await (await round.claim()).wait()
    assert.equal(await usdt.balanceOf(await organizer.getAddress()) - before, USDT(1050))
    assert.equal(await round.claimed(), true)
    await rejects(round.claim(), 'AlreadyClaimed')
  })

  test('failed round: everyone refunds, organizer gets nothing', async () => {
    const round = await newRound()
    await bid(round, alice, USDT(200))
    await bid(round, bob, USDT(100))
    await env.warp(8 * DAY)
    assert.equal(await round.state(), State.Failed)
    await rejects(round.claim(), 'NotSucceeded')
    await rejects(bid(round, mallory, USDT(50)), 'NotOpen')

    const a0 = await usdt.balanceOf(await alice.getAddress())
    await (await round.connect(alice).refund()).wait()
    assert.equal(await usdt.balanceOf(await alice.getAddress()) - a0, USDT(200))
    await rejects(round.connect(alice).refund(), 'NothingToRefund')
    await (await round.connect(bob).refund()).wait()
    assert.equal(await usdt.balanceOf(await round.getAddress()), 0n)
  })

  test('withdraw while open, respecting minBid', async () => {
    const round = await newRound()
    await bid(round, alice, USDT(100))
    await rejects(round.connect(alice).withdraw(USDT(95)), 'BelowMinBid') // would leave 5 < 10
    await (await round.connect(alice).withdraw(USDT(40))).wait()
    assert.equal(await round.pledgeOf(await alice.getAddress()), USDT(60))
    await (await round.connect(alice).withdraw(USDT(60))).wait()
    assert.equal(await round.total(), 0n)
    assert.equal(await round.bidderCount(), 0n)
    await rejects(round.connect(alice).withdraw(1n), 'TooMuch')
    await env.warp(8 * DAY)
    await rejects(round.connect(alice).withdraw(1n), 'NotOpen')
  })

  test('minimum bid is enforced', async () => {
    const round = await newRound({ minBid: USDT(25) })
    await rejects(bid(round, alice, USDT(10)), 'BelowMinBid')
    await bid(round, alice, USDT(25))
    await bid(round, alice, USDT(1)) // raising by a small amount is fine
    assert.equal(await round.pledgeOf(await alice.getAddress()), USDT(26))
  })

  test('invite-only round rejects bidders without a valid invite', async () => {
    const inviteKey = Wallet.createRandom().privateKey
    const round = await newRound({ invite: inviteKey })
    await rejects(bid(round, mallory, USDT(50)), 'InvalidInvite')
    // a signature for someone else does not work
    const forAlice = await signInvite(round, inviteKey, await alice.getAddress())
    await rejects(bid(round, mallory, USDT(50), forAlice), 'InvalidInvite')
    // a signature by a different key does not work
    const fake = await signInvite(round, Wallet.createRandom().privateKey, await mallory.getAddress())
    await rejects(bid(round, mallory, USDT(50), fake), 'InvalidInvite')

    await bid(round, alice, USDT(50), forAlice)
    await bid(round, alice, USDT(50)) // raising needs no invite again
    assert.equal(await round.pledgeOf(await alice.getAddress()), USDT(100))
  })

  test('organizer can cancel an open round, bidders refund', async () => {
    const round = await newRound()
    await bid(round, alice, USDT(1000))
    await rejects(round.connect(alice).cancel(), 'NotOrganizer')
    await (await round.cancel()).wait()
    assert.equal(await round.state(), State.Failed)
    await rejects(bid(round, bob, USDT(50)), 'NotOpen')
    await rejects(round.claim(), 'NotSucceeded')
    await (await round.connect(alice).refund()).wait()
    await env.warp(8 * DAY)
    assert.equal(await round.state(), State.Failed) // stays failed after deadline even though target was met
  })

  test('info() returns the whole round in one call', async () => {
    const round = await newRound({ target: USDT(500) })
    await bid(round, alice, USDT(70))
    const i = await round.info()
    assert.equal(i.target_, USDT(500))
    assert.equal(i.total_, USDT(70))
    assert.equal(i.bidderCount_, 1n)
    assert.equal(i.state_, State.Open)
    assert.equal(i.organizer_, await organizer.getAddress())
  })

  test('constructor rejects nonsense parameters', async () => {
    const t = await usdt.getAddress()
    const now = await env.now()
    await rejects(factory.createRound(t, 0, now + DAY, 0, ZeroAddress), 'BadParams')
    await rejects(factory.createRound(t, 1, now - 1, 0, ZeroAddress), 'BadParams')
    await rejects(factory.createRound(ZeroAddress, 1, now + DAY, 0, ZeroAddress), 'BadParams')
  })
})
