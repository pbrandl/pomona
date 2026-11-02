// End-to-end: real contracts on a local EVM, real WDK wallets, real Hyperswarm
// (local testnet). Each test is a story from the user's point of view.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setup, PASSWORD } from './helpers.js'
import { encodeInvite, decodeInvite, decodeReceipt, encodeReceipt } from '../core/index.js'
import { receiptMessage } from '../core/links.js'
import { Wallet } from 'ethers'

const DAY = 86400

/** Polls `fn` until it returns a truthy value (P2P data arrives asynchronously). */
async function eventually (fn, ms = 10000) {
  const end = Date.now() + ms
  while (true) {
    const v = await fn()
    if (v || Date.now() > end) return v
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
const MONTH = 30 * DAY
let env

before(async () => { env = await setup() })
after(async () => { await env.teardown() })

test('wallet: password-protected, lockable, seed only with password', async () => {
  const a = await env.make()
  assert.equal((await a.status()).wallet.state, 'none')
  await assert.rejects(a.createWallet({ password: 'kurz' }), /mindestens 8/)
  const { seed, address } = await a.createWallet({ password: PASSWORD })
  assert.equal(seed.split(' ').length, 12)
  assert.equal((await a.status()).wallet.state, 'unlocked')

  a.lock()
  assert.equal((await a.status()).wallet.state, 'locked')
  await assert.rejects(a.faucet(), /gesperrt/)
  await assert.rejects(a.unlock({ password: 'falsches-passwort' }), /Falsches Passwort/)
  assert.equal((await a.unlock({ password: PASSWORD })).address, address)
  assert.throws(() => a.revealSeed({ password: 'falsches-passwort' }), /Falsches Passwort/)
  assert.equal(a.revealSeed({ password: PASSWORD }), seed)

  // Brute force: after three wrong passwords, attempts are throttled.
  for (let i = 0; i < 3; i++) assert.throws(() => a.revealSeed({ password: 'rate-' + i + 'xxxx' }), /Falsches Passwort/)
  assert.throws(() => a.revealSeed({ password: PASSWORD }), /Zu viele falsche Versuche/)
  a._passwordBlockedUntil = 0 // (test shortcut instead of waiting)
  assert.equal(a.revealSeed({ password: PASSWORD }), seed)

  const b = await env.make()
  assert.equal((await b.restoreWallet({ seed: seed.toUpperCase(), password: PASSWORD })).address, address)
  await assert.rejects(b.restoreWallet({ seed, password: PASSWORD }), /bereits eine Wallet/) // never overwrite a vault
  await assert.rejects((await env.make()).restoreWallet({ seed: 'nicht gültig', password: PASSWORD }), /ungültig/)
})

test('monthly round: bid via Pears link, invoice per month, receipts, terminate, refund', async () => {
  const farm = await env.funded()
  const alice = await env.funded()
  const bob = await env.funded()

  const { link } = await farm.createRound({
    title: 'Solawi Lindenhof 2027',
    description: 'Gemüse für 40 Haushalte',
    target: '150',
    minBid: '10',
    interval: 'month',
    installments: 3,
    biddingDays: 7,
    inviteOnly: true
  })
  let s = await farm.status()
  assert.equal(s.round.role, 'organizer')
  assert.equal(s.round.intervalName, 'month')
  assert.equal(s.round.installments, 3)
  assert.equal(s.round.phase, 'bidding')
  await farm.postNews({ text: 'Willkommen!' })

  await alice.join({ link })
  s = await alice.status()
  assert.equal(s.round.title, 'Solawi Lindenhof 2027')
  assert.equal(s.round.verified, true)
  assert.equal(await eventually(async () => (await alice.status()).round.news[0]?.text), 'Willkommen!')

  // Bob joins while the organizer is offline: Alice seeds the manifest.
  await farm.p2p.swarm.leave(farm.p2p.manifest.core.discoveryKey)
  for (const c of farm.p2p.swarm.connections) c.destroy()
  await bob.join({ link })
  assert.equal((await bob.status()).round.title, 'Solawi Lindenhof 2027')

  await alice.bid({ amount: '100' })
  s = await alice.status()
  assert.equal(s.round.myPledge, '100')
  assert.equal(s.round.myDeposit, '300') // 3 installments
  assert.equal(s.wallet.usdt, '4700')

  await bob.bid({ amount: '30' })
  await bob.bid({ amount: '25,5' }) // raise, German comma
  await bob.withdraw({ amount: '5,5' })
  s = await bob.status()
  assert.equal(s.round.myPledge, '50')
  assert.equal(s.round.total, '150')
  assert.equal(s.round.progress, 1)
  await assert.rejects(bob.bid({ amount: '5000' }), /brauchst du 15000 USDT/)
  await assert.rejects(alice.invoice(), /Nur der Organisator/)
  await assert.rejects(farm.invoice(), /aktuellen Phase/)

  await env.warp(7 * DAY)
  s = await farm.status()
  assert.equal(s.round.phase, 'running')
  assert.equal(s.round.canInvoice, true)
  assert.equal(s.round.invoices[0].status, 'due')
  await farm.invoice() // installment 1
  assert.equal((await farm.status()).wallet.usdt, '5150')
  await assert.rejects(farm.invoice(), /noch nicht fällig/)

  // Alice's receipt for installment 1 checks out on-chain, also from Bob's app.
  s = await alice.status()
  assert.deepEqual(s.round.invoices.map((i) => i.status), ['paid', 'scheduled', 'scheduled'])
  assert.equal(s.round.invoices[0].amount, '100') // Alice's share
  assert.ok(s.round.invoices[0].paidAt >= s.round.biddingEnd)
  assert.equal(s.round.invoices[1].dueAt, s.round.biddingEnd + MONTH)
  assert.equal((await farm.status()).round.invoices[0].amount, '150') // organizer sees the total
  const { code } = await alice.receipt({ index: 0 })
  const v = await bob.verifyReceipt({ code })
  assert.equal(v.valid, true)
  assert.equal(v.amount, '100')
  assert.equal(v.installment, 1)
  assert.equal(v.title, 'Solawi Lindenhof 2027')
  await assert.rejects(alice.receipt({ index: 1 }), /keinen Beleg/)
  // Tampering with a real receipt breaks its signature.
  const forged = encodeReceipt({ ...decodeReceipt(code), index: 1 })
  assert.match((await bob.verifyReceipt({ code: forged })).reason, /Unterschrift/)
  // Bob builds a receipt for Alice's (public) address with his own key: rejected.
  const aliceAddr = (await alice.status()).wallet.address
  const fake = { network: 'local', round: s.round.address, bidder: aliceAddr, index: 0, at: Math.floor(Date.now() / 1000) }
  const bobKey = Wallet.createRandom()
  const fakeSig = await bobKey.signMessage(receiptMessage(fake))
  const v2 = await farm.verifyReceipt({ code: encodeReceipt({ ...fake, owner: bobKey.address, sig: fakeSig }) })
  assert.equal(v2.valid, false)
  // An old screenshot expires.
  const old = { ...decodeReceipt(code), at: decodeReceipt(code).at - 3600 }
  assert.match((await bob.verifyReceipt({ code: encodeReceipt(old) })).reason, /abgelaufen/)

  await env.warp(MONTH)
  await farm.invoice() // installment 2
  await farm.terminate() // the farm stops early
  s = await alice.status()
  assert.equal(s.round.phase, 'completed')
  assert.deepEqual(s.round.invoices.map((i) => i.status), ['paid', 'paid', 'void'])
  assert.equal(s.round.refundable, '100')
  await alice.refund()
  assert.equal((await alice.status()).wallet.usdt, '4800') // paid 2 × 100
  await assert.rejects(alice.refund(), /nichts zurückzuzahlen/)
})

test('missed target: everyone gets the full deposit back', async () => {
  const farm = await env.funded()
  const carol = await env.funded()
  const { link } = await farm.createRound({ title: 'Zu ambitioniert', target: '10000', interval: 'week', installments: 4, biddingDays: 2, inviteOnly: false })
  await carol.join({ link })
  await carol.bid({ amount: '50' })
  assert.equal((await carol.status()).wallet.usdt, '4800')
  await env.warp(3 * DAY)
  assert.equal((await carol.status()).round.phase, 'failed')
  await assert.rejects(farm.invoice(), /aktuellen Phase/)
  await carol.refund()
  assert.equal((await carol.status()).wallet.usdt, '5000')
})

test('security: forged rounds, missing invites and wrong invite keys are refused', async () => {
  const farm = await env.funded()
  const eve = await env.funded()
  const { link } = await farm.createRound({ title: 'Echt', target: '100', interval: 'week', installments: 2, biddingDays: 1, inviteOnly: true })
  const inv = decodeInvite(link)

  // A look-alike contract that did not come from the factory.
  const fake = await env.deployForgedRound(await eve.account.address())
  const victim = await env.funded()
  await assert.rejects(victim.join({ link: encodeInvite({ ...inv, round: fake }) }), /nicht von der Pomona-Factory/)

  // Wrong invite key in the link.
  await assert.rejects(victim.join({ link: encodeInvite({ ...inv, inviteKey: '0x' + '11'.repeat(32) }) }), /passt nicht/)

  // Round known, but no invite key.
  await eve.join({ link: encodeInvite({ ...inv, inviteKey: null }) })
  await assert.rejects(eve.bid({ amount: '50' }), /Einladungslink/)
})

test('wallet policy blocks calls outside Pomona, even from inside the core', async () => {
  const a = await env.funded()
  await assert.rejects(a.account.execute([{ to: env.addresses.token, data: '0xa9059cbb' + '00'.repeat(64) }]), /Richtlinie|Policy/)
  await assert.rejects(a.account.execute([{ to: '0x000000000000000000000000000000000000dEaD', data: '0x' }]), /Richtlinie|Policy/)
})

test('send USDT out of the wallet', async () => {
  const a = await env.funded()
  const b = await env.make()
  await b.createWallet({ password: PASSWORD })
  const to = (await b.status()).wallet.address
  await assert.rejects(a.sendUsdt({ to, amount: '1', password: 'falsches-passwort' }), /Falsches Passwort/)
  await assert.rejects(a.sendUsdt({ to: 'nope', amount: '1', password: PASSWORD }), /gültige Adresse/)
  await assert.rejects(a.sendUsdt({ to, amount: '999999', password: PASSWORD }), /Nicht genug/)
  await a.sendUsdt({ to, amount: '12,34', password: PASSWORD })
  assert.equal((await b.status()).wallet.usdt, '12.34')
})

test('the dev chain is unavailable outside developer mode', async () => {
  const a = await env.make({ allowDev: false })
  const s = await a.status()
  assert.equal(s.network.id, 'arbitrum-sepolia')
  assert.equal(s.networks.some((n) => n.id === 'local'), false)
  await a.createWallet({ password: PASSWORD })
  const link = encodeInvite({ manifest: 'a'.repeat(64), network: 'local', round: '0x' + '1'.repeat(40) })
  await assert.rejects(a.join({ link }), /Entwicklermodus/)
})

test('live: other participants learn about a new bid from the contract event', async () => {
  const farm = await env.funded()
  const alice = await env.funded()
  const bob = await env.funded()
  const biddingEnd = (await farm.provider.getBlock('latest')).timestamp + 10 * DAY // chain time (tests warp it)
  const { link } = await farm.createRound({ title: 'Live', target: '100', interval: 'week', installments: 2, biddingEnd, inviteOnly: false })
  await alice.join({ link })
  await bob.join({ link })
  assert.equal((await alice.status()).round.biddingEnd, biddingEnd)

  // Alice does nothing; her app must notice Bob's bid by itself (pollMs is 60 s in tests).
  const noticed = new Promise((resolve) => {
    const check = async () => { if ((await alice.status()).round.total === '42') { alice.off('change', check); resolve(Date.now()) } }
    alice.on('change', check)
  })
  const sent = Date.now()
  await bob.bid({ amount: '42' })
  const at = await Promise.race([noticed, new Promise((resolve) => setTimeout(() => resolve(null), 5000))])
  assert.ok(at, 'Alice did not see the bid within 5 s')
  assert.ok(at - sent < 5000)
})

test('bidding UX: guide, quote before committing, progress steps, deposit detection', async () => {
  const farm = await env.funded()
  const dana = await env.funded()
  const { link } = await farm.createRound({ title: 'UX', target: '400', guide: '100', minBid: '50', interval: 'month', installments: 12, biddingDays: 5, inviteOnly: true })
  await dana.join({ link })
  assert.equal((await dana.status()).round.guide, '100')

  // Quote: shows what will happen, without sending anything.
  const q = await dana.quoteBid({ amount: '100' })
  assert.equal(q.deposit, '1200')
  assert.equal(q.enough, true)
  assert.equal(q.fee, null) // dev chain: fees are invisible
  const tooMuch = await dana.quoteBid({ amount: '1000' })
  assert.equal(tooMuch.enough, false)
  assert.equal(tooMuch.missing, '7000') // 12,000 needed, 5,000 available
  await assert.rejects(dana.quoteBid({ amount: '10' }), /Mindestgebot/)
  assert.equal((await dana.status()).wallet.usdt, '5000') // nothing moved

  // Progress: prepare → sign → confirm while the bid runs.
  const steps = []
  const track = () => { if (dana._busyStep && steps.at(-1) !== dana._busyStep) steps.push(dana._busyStep) }
  dana.on('change', track)
  await dana.bid({ amount: '100' })
  dana.off('change', track)
  assert.deepEqual(steps.slice(0, 3), ['prepare', 'sign', 'confirm'])
  assert.equal((await dana.status()).busyStep, null)

  // Incoming USDT is noticed by itself (no polling of status needed).
  const noticed = new Promise((resolve) => dana.once('funds', resolve))
  await farm.sendUsdt({ to: (await dana.status()).wallet.address, amount: '25', password: PASSWORD })
  const ok = await Promise.race([noticed.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 5000))])
  assert.ok(ok, 'deposit not detected within 5 s')
  assert.equal((await dana.status()).wallet.usdt, '3825')
})

test('assistant on a real round: answers, prepares, never moves money', async () => {
  const farm = await env.funded()
  // A scripted "model": first it calculates, then it prepares a bid.
  const script = [
    { toolCalls: [{ id: 'a', name: 'calculate_bid', arguments: { amount: '120' } }] },
    { toolCalls: [{ id: 'b', name: 'prepare_bid', arguments: { amount: '120' } }] },
    { text: 'Ich habe 120 USDT pro Monat vorbereitet. Hinterlegt würden 1.440 USDT.' }
  ]
  const seen = []
  const engine = {
    async load (key, onProgress) { onProgress(1) },
    async chat ({ messages }) { seen.push(messages); return script[seen.length - 1] ?? { text: '' } },
    async close () {}
  }
  const erik = await env.funded({ assistantEngine: () => engine })
  const { link } = await farm.createRound({ title: 'KI-Runde', target: '500', guide: '100', interval: 'month', installments: 12, biddingDays: 5, inviteOnly: true })
  await erik.join({ link })

  let s = await erik.status()
  assert.equal(s.assistant.state, 'none')
  assert.ok(s.assistant.suggestions.some((x) => x.topic === 'howmuch'))

  const topic = await erik.assistantAsk({ topic: 'howmuch' })
  assert.match(topic.reply, /Richtwert liegt bei 100 USDT pro Monat/)
  assert.deepEqual(topic.actions.map((a) => a.type), ['bid'])

  const rule = await erik.assistantAsk({ text: 'Ich möchte 80 im Monat bieten' })
  assert.equal(rule.source, 'rules')
  assert.equal(rule.actions[0].amount, '80')

  await erik.assistantInstall({ model: 'small' })
  await erik.assistant._loading
  assert.equal((await erik.status()).assistant.state, 'ready')

  const before = (await erik.status()).wallet.usdt
  const model = await erik.assistantAsk({ text: 'Kannst du mir ein Gebot vorbereiten, etwas über dem Richtwert?' })
  assert.equal(model.source, 'model')
  assert.equal(model.actions[0].amount, '120')
  const calc = JSON.parse(seen[1].find((m) => m.role === 'tool').content)
  assert.equal(calc.deposit, '1440') // real quote from the core
  assert.equal(calc.enough, true)
  assert.match(seen[0][0].content, /Richtwert: 100 USDT pro Monat/) // the model saw the live numbers

  s = await erik.status()
  assert.equal(s.wallet.usdt, before) // nothing moved
  assert.equal(s.round.myPledge, '0') // nothing bid
  erik.lock()
  assert.equal(erik.assistant.turns.length, 0) // conversation forgotten on lock
})

test('invoice mode: bid without deposit, invoices arrive by themselves, pay with one signature, receipt only after paying', async () => {
  const farm = await env.funded()
  const alice = await env.funded()
  const poor = await env.make()
  await poor.createWallet({ password: PASSWORD }) // no USDT

  const { link } = await farm.createRound({ title: 'Kleine Solawi', mode: 'invoice', target: '100', interval: 'week', installments: 3, biddingDays: 2, inviteOnly: true })
  await alice.join({ link })
  await poor.join({ link })

  const q = await alice.quoteBid({ amount: '60' })
  assert.equal(q.mode, 'invoice')
  assert.equal(q.deposit, '0')
  const before = (await alice.status()).wallet.usdt
  await alice.bid({ amount: '60' })
  await poor.bid({ amount: '40' }) // a promise needs no balance
  let s = await alice.status()
  assert.equal(s.wallet.usdt, before) // nothing locked
  assert.equal(s.round.mode, 'invoice')
  assert.equal(s.round.myDeposit, '0')
  assert.equal(s.round.invoices[0].status, 'scheduled')
  await assert.rejects(alice.pay({}), /keine offene Rechnung/)

  await env.warp(2 * DAY)
  s = await alice.status()
  assert.equal(s.round.phase, 'running')
  assert.equal(s.round.canInvoice, false) // nobody has to issue anything
  assert.equal(s.round.openInvoices, 1)
  assert.equal(s.round.openAmount, '60')
  assert.equal(s.round.invoices[0].status, 'open')
  await assert.rejects(alice.receipt({ index: 0 }), /keinen Beleg/)
  await assert.rejects(farm.invoice(), /automatisch/)

  const farmBefore = Number((await farm.status()).wallet.usdt)
  const quote = await alice.quotePay({})
  assert.deepEqual(quote.invoices, [1])
  assert.equal(quote.amount, '60')
  await alice.pay({})
  assert.equal(Number((await farm.status()).wallet.usdt) - farmBefore, 60)
  s = await alice.status()
  assert.equal(s.round.invoices[0].status, 'paid')
  assert.equal(s.round.openInvoices, 0)
  const r = await alice.receipt({ index: 0 })
  const v = await farm.verifyReceipt({ code: r.code })
  assert.equal(v.valid, true)
  assert.equal(v.amount, '60')

  // Not enough USDT: no payment, no receipt, invoice stays open.
  await assert.rejects(poor.pay({}), /fehlen 40 USDT\. Ohne Zahlung gibt es keinen Beleg/)
  s = await poor.status()
  assert.equal(s.round.invoices[0].status, 'open')
  await assert.rejects(poor.receipt({ index: 0 }), /keinen Beleg/)

  // The organizer sees who has paid and who has not.
  s = await farm.status()
  assert.equal(s.round.invoices[0].status, 'issued')
  assert.equal(s.round.invoices[0].paidCount, 1)
  assert.equal(s.round.invoices[0].paidSum, '60')
  const d = await farm.invoiceDetails({ index: 0 })
  assert.equal(d.unpaid.length, 1)
  assert.equal(d.unpaid[0].amount, '40')
  await assert.rejects(alice.invoiceDetails({ index: 0 }), /Organisator/)

  // Two weeks later: two invoices open at once, paid in one go.
  await env.warp(14 * DAY)
  s = await alice.status()
  assert.equal(s.round.openInvoices, 2)
  await alice.pay({})
  s = await alice.status()
  assert.deepEqual(s.round.invoices.map((x) => x.status), ['paid', 'paid', 'paid'])
  assert.equal(s.round.phase, 'running') // until the last interval is over
  assert.equal(s.round.invoiceCount, 3)
})
