import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Wallet, ZeroAddress, Interface } from 'ethers'
import { chain, deploy, at, signInvite, artifact } from './helpers.js'

const USDT = (n) => BigInt(Math.round(n * 1e6))
const DAY = 86400
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const Phase = { Bidding: 0n, Failed: 1n, Running: 2n, Completed: 3n }

const iface = new Interface([...artifact('PomonaRound').abi, ...artifact('PomonaFactory').abi])

// Walks a provider error and returns the first custom error our ABI knows.
function revertName (e, seen = new Set()) {
  if (!e || typeof e !== 'object' || seen.has(e)) return null
  seen.add(e)
  for (const v of Object.values(e)) {
    if (typeof v === 'string' && /^0x[0-9a-f]{8}/i.test(v)) {
      try { const parsed = iface.parseError(v); if (parsed) return parsed.name } catch {}
    }
    const found = revertName(v, seen)
    if (found) return found
  }
  return null
}

async function rejects (p, name) {
  await assert.rejects(p, (e) => {
    assert.equal(revertName(e), name, e.message)
    return true
  })
}

let env, usdt, factory, organizer, alice, bob, mallory
const addr = (s) => s.getAddress()

async function newRound ({ target = 100, minBid = 10, invite = null, biddingDays = 7, interval = MONTH, installments = 12, from = organizer, fac = factory } = {}) {
  const biddingEnd = (await env.now()) + biddingDays * DAY
  const signer = invite ? new Wallet(invite).address : ZeroAddress
  const tx = await fac.connect(from).createRound(USDT(target), USDT(minBid), biddingEnd, interval, installments, signer)
  const rcpt = await tx.wait()
  const ev = rcpt.logs.map((l) => { try { return fac.interface.parseLog(l) } catch { return null } }).find((e) => e?.name === 'RoundCreated')
  const round = at('PomonaRound', ev.args.round, organizer)
  round.biddingEnd = biddingEnd
  return round
}

async function bid (round, who, perInstallment, sig = '0x', token = usdt) {
  const n = await round.installments()
  await (await token.connect(who).approve(await round.getAddress(), USDT(perInstallment) * n)).wait()
  return (await round.connect(who).bid(USDT(perInstallment), sig)).wait()
}

const bal = async (s) => usdt.balanceOf(await addr(s))
const warpTo = async (t) => env.warp(t - (await env.now()))

describe('PomonaRound', () => {
  before(async () => {
    env = await chain()
    ;[organizer, alice, bob, mallory] = env.signers
    usdt = await deploy('MockUSDT', organizer)
    factory = await deploy('PomonaFactory', organizer, await usdt.getAddress())
    for (const s of [alice, bob, mallory]) await (await usdt.mint(await addr(s), USDT(100000))).wait()
  })
  after(() => env.close())

  test('bid deposits per-installment amount times installments', async () => {
    const round = await newRound({ installments: 12 })
    const a0 = await bal(alice)
    await bid(round, alice, 60)
    assert.equal(a0 - await bal(alice), USDT(720))
    await bid(round, alice, 5) // raise
    assert.equal(await round.pledgeOf(await addr(alice)), USDT(65))
    assert.equal(await round.total(), USDT(65))
    assert.equal(await usdt.balanceOf(await round.getAddress()), USDT(780))
  })

  test('monthly schedule: invoices are due once per interval, at most N times', async () => {
    const round = await newRound({ target: 100, installments: 3, interval: MONTH })
    await bid(round, alice, 60)
    await bid(round, bob, 50)
    await rejects(round.invoice(), 'WrongPhase') // still bidding

    await warpTo(round.biddingEnd)
    assert.equal(await round.phase(), Phase.Running)
    await rejects(round.connect(alice).invoice(), 'NotOrganizer')

    const o0 = await bal(organizer)
    await (await round.invoice()).wait() // #0 due at biddingEnd
    assert.equal(await bal(organizer) - o0, USDT(110))
    await rejects(round.invoice(), 'NotDue') // #1 only after one interval

    await env.warp(MONTH)
    await (await round.invoice()).wait() // #1
    await env.warp(MONTH)
    await (await round.invoice()).wait() // #2
    assert.equal(await round.invoiceCount(), 3n)
    assert.equal(await round.phase(), Phase.Completed)
    await rejects(round.invoice(), 'WrongPhase') // no fourth invoice
    assert.equal(await bal(organizer) - o0, USDT(330))
    assert.equal(await usdt.balanceOf(await round.getAddress()), 0n)
    await rejects(round.connect(alice).refund(), 'NothingToRefund')
  })

  test('late invoices can be caught up, but never before they are due', async () => {
    const round = await newRound({ target: 10, installments: 4, interval: WEEK })
    await bid(round, alice, 10)
    await warpTo(round.biddingEnd + 2 * WEEK + 60) // organizer was away for two weeks
    await (await round.invoice()).wait() // #0
    await (await round.invoice()).wait() // #1
    await (await round.invoice()).wait() // #2 (due exactly at biddingEnd + 2 weeks)
    await rejects(round.invoice(), 'NotDue') // #3 not before biddingEnd + 3 weeks
  })

  test('receipts prove which installments a bidder paid', async () => {
    const round = await newRound({ target: 50, installments: 2, interval: WEEK })
    await bid(round, alice, 30)
    await bid(round, bob, 20)
    await warpTo(round.biddingEnd)
    let [amount, paidAt] = await round.receipt(await addr(alice), 0)
    assert.equal(amount, 0n) // nothing invoiced yet
    await (await round.invoice()).wait()
    ;[amount, paidAt] = await round.receipt(await addr(alice), 0)
    assert.equal(amount, USDT(30))
    assert.ok(paidAt >= BigInt(round.biddingEnd))
    ;[amount] = await round.receipt(await addr(mallory), 0)
    assert.equal(amount, 0n) // did not bid
    ;[amount] = await round.receipt(await addr(alice), 1)
    assert.equal(amount, 0n) // not invoiced yet
  })

  test('missed target: full refund, no invoices', async () => {
    const round = await newRound({ target: 1000, installments: 12 })
    await bid(round, alice, 100)
    const a0 = await bal(alice)
    await warpTo(round.biddingEnd)
    assert.equal(await round.phase(), Phase.Failed)
    await rejects(round.invoice(), 'WrongPhase')
    await rejects(bid(round, bob, 50), 'WrongPhase')
    assert.equal(await round.refundable(await addr(alice)), USDT(1200))
    await (await round.connect(alice).refund()).wait()
    assert.equal(await bal(alice) - a0, USDT(1200))
    await rejects(round.connect(alice).refund(), 'NothingToRefund')
  })

  test('terminate: bidders get back what was not invoiced', async () => {
    const round = await newRound({ target: 100, installments: 12 })
    await bid(round, alice, 100)
    await warpTo(round.biddingEnd)
    await (await round.invoice()).wait()
    await env.warp(MONTH)
    await (await round.invoice()).wait()
    await rejects(round.connect(alice).terminate(), 'NotOrganizer')
    await (await round.terminate()).wait()
    assert.equal(await round.phase(), Phase.Completed)
    await rejects(round.invoice(), 'WrongPhase')
    const a0 = await bal(alice)
    await (await round.connect(alice).refund()).wait()
    assert.equal(await bal(alice) - a0, USDT(1000)) // 10 of 12 installments
  })

  test('schedule expiry: un-invoiced installments go back to bidders', async () => {
    const round = await newRound({ target: 10, installments: 3, interval: WEEK })
    await bid(round, alice, 10)
    await warpTo(round.biddingEnd)
    await (await round.invoice()).wait()
    await warpTo(round.biddingEnd + 3 * WEEK) // organizer never invoiced again
    assert.equal(await round.phase(), Phase.Completed)
    await rejects(round.invoice(), 'WrongPhase')
    assert.equal(await round.refundable(await addr(alice)), USDT(20))
  })

  test('withdraw while bidding, respecting minBid', async () => {
    const round = await newRound({ minBid: 10, installments: 2 })
    await bid(round, alice, 30)
    await rejects(round.connect(alice).withdraw(USDT(25)), 'BelowMinBid') // would leave 5
    const a0 = await bal(alice)
    await (await round.connect(alice).withdraw(USDT(30))).wait()
    assert.equal(await bal(alice) - a0, USDT(60))
    assert.equal(await round.bidderCount(), 0n)
    await rejects(round.connect(alice).withdraw(1n), 'TooMuch')
    await rejects(bid(round, alice, 5), 'BelowMinBid')
  })

  test('invite-only: no invite, foreign invite, wrong key, other round', async () => {
    const key = Wallet.createRandom().privateKey
    const round = await newRound({ invite: key })
    const other = await newRound({ invite: key })
    await rejects(bid(round, mallory, 10), 'InvalidInvite')
    const forAlice = await signInvite(round, key, await addr(alice))
    await rejects(bid(round, mallory, 10, forAlice), 'InvalidInvite')
    const wrongKey = await signInvite(round, Wallet.createRandom().privateKey, await addr(mallory))
    await rejects(bid(round, mallory, 10, wrongKey), 'InvalidInvite')
    const otherRound = await signInvite(other, key, await addr(alice))
    await rejects(bid(round, alice, 10, otherRound), 'InvalidInvite') // replay across rounds
    await bid(round, alice, 10, forAlice)
    await bid(round, alice, 10) // raising needs no invite
  })

  test('cancel during bidding refunds everything', async () => {
    const round = await newRound({ target: 10, installments: 4 })
    await bid(round, alice, 50)
    await rejects(round.connect(alice).cancel(), 'NotOrganizer')
    await (await round.cancel()).wait()
    await warpTo(round.biddingEnd)
    assert.equal(await round.phase(), Phase.Failed) // stays failed although target was met
    assert.equal(await round.refundable(await addr(alice)), USDT(200))
  })

  test('fee-on-transfer tokens are rejected', async () => {
    const fee = await deploy('FeeToken', organizer)
    await (await fee.mint(await addr(alice), USDT(1000))).wait()
    const feeFactory = await deploy('PomonaFactory', organizer, await fee.getAddress())
    const round = await newRound({ fac: feeFactory })
    await rejects(bid(round, alice, 10, '0x', fee), 'UnsupportedToken')
  })

  test('factory registry recognizes only its own rounds', async () => {
    const round = await newRound({ from: bob })
    assert.equal(await factory.isRound(await round.getAddress()), true)
    assert.equal(await factory.isRound(await usdt.getAddress()), false)
    const list = await factory.roundsOf(await addr(bob))
    assert.equal(list.at(-1), await round.getAddress())
    assert.equal(await round.organizer(), await addr(bob))
  })

  test('info() returns the whole round', async () => {
    const round = await newRound({ target: 400, installments: 6, interval: WEEK })
    await bid(round, alice, 70)
    const i = await round.info()
    assert.equal(i.target, USDT(400))
    assert.equal(i.total, USDT(70))
    assert.equal(i.installments, 6n)
    assert.equal(i.interval, BigInt(WEEK))
    assert.equal(i.nextInvoiceAt, BigInt(round.biddingEnd))
    assert.equal(i.expiresAt, BigInt(round.biddingEnd + 6 * WEEK))
    assert.equal(i.phase, Phase.Bidding)
  })

  test('constructor rejects nonsense', async () => {
    const now = await env.now()
    await rejects(factory.createRound(0, 0, now + DAY, WEEK, 1, ZeroAddress), 'BadParams')
    await rejects(factory.createRound(1, 0, now - 1, WEEK, 1, ZeroAddress), 'BadParams')
    await rejects(factory.createRound(1, 0, now + DAY, 3600, 1, ZeroAddress), 'BadParams')
    await rejects(factory.createRound(1, 0, now + DAY, WEEK, 0, ZeroAddress), 'BadParams')
    await rejects(factory.createRound(1, 0, now + DAY, WEEK, 521, ZeroAddress), 'BadParams')
    await assert.rejects(deploy('PomonaFactory', organizer, await addr(alice))) // token without code
  })
})
