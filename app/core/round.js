// Talks to the PomonaRound escrow contract. Reads go through a plain JSON-RPC
// provider; every write is signed and sent by the WDK wallet.
import { JsonRpcProvider, Contract, Interface, Wallet as KeyWallet, getBytes } from 'ethers'
import abi from './abi.js'

export const STATE = ['open', 'succeeded', 'failed']

const roundIface = new Interface(abi.PomonaRound)
const factoryIface = new Interface(abi.PomonaFactory)
const tokenIface = new Interface(abi.MockUSDT)

export function providerFor (net) {
  return new JsonRpcProvider(net.rpc, net.chainId, { staticNetwork: true, pollingInterval: net.dev ? 50 : 2000, cacheTimeout: -1 })
}

// Turns a revert into a short German sentence for the UI.
const MESSAGES = {
  NotOpen: 'Die Runde ist nicht mehr offen.',
  NotOrganizer: 'Nur der Organisator darf das.',
  ZeroAmount: 'Bitte einen Betrag eingeben.',
  BelowMinBid: 'Das Gebot liegt unter dem Mindestgebot.',
  InvalidInvite: 'Die Einladung ist ungültig.',
  TooMuch: 'Mehr als dein Gebot kann nicht zurückgezogen werden.',
  NotSucceeded: 'Das Ziel ist (noch) nicht erreicht.',
  NotFailed: 'Rückzahlung ist nur bei verfehlten Runden möglich.',
  AlreadyClaimed: 'Die Runde wurde bereits ausgezahlt.',
  NothingToRefund: 'Es gibt nichts zurückzuzahlen.',
  BadParams: 'Ungültige Angaben für die Runde.'
}

function findRevert (e, seen = new Set()) {
  if (!e || typeof e !== 'object' || seen.has(e)) return null
  seen.add(e)
  for (const v of Object.values(e)) {
    if (typeof v === 'string' && /^0x[0-9a-f]{8}/i.test(v)) {
      try {
        const parsed = roundIface.parseError(v)
        if (parsed) return parsed.name
      } catch {}
    }
    const nested = findRevert(v, seen)
    if (nested) return nested
  }
  return null
}

export function explain (e) {
  const name = findRevert(e)
  if (name && MESSAGES[name]) return Object.assign(new Error(MESSAGES[name]), { code: name })
  return e
}

export class RoundClient {
  constructor ({ net, address, wallet, provider = providerFor(net) }) {
    this.net = net
    this.address = address
    this.wallet = wallet
    this.provider = provider
    this.contract = new Contract(address, abi.PomonaRound, provider)
  }

  // Organizer: deploy a new round through the factory.
  static async create ({ net, wallet, token, target, deadline, minBid, inviteSigner, provider = providerFor(net) }) {
    if (!net.factory) throw new Error('Auf diesem Netzwerk ist noch keine Pomona-Factory installiert.')
    const data = factoryIface.encodeFunctionData('createRound', [token, target, deadline, minBid, inviteSigner])
    const receipt = await sendAndWait(provider, wallet, net.factory, data)
    for (const log of receipt.logs) {
      try {
        const ev = factoryIface.parseLog(log)
        if (ev?.name === 'RoundCreated') return new RoundClient({ net, address: ev.args.round, wallet, provider })
      } catch {}
    }
    throw new Error('Runde wurde nicht erstellt')
  }

  async info () {
    const i = await this.contract.info()
    return {
      address: this.address,
      token: i.token_,
      organizer: i.organizer_,
      target: i.target_,
      deadline: Number(i.deadline_),
      minBid: i.minBid_,
      inviteSigner: i.inviteSigner_,
      total: i.total_,
      bidderCount: Number(i.bidderCount_),
      state: STATE[Number(i.state_)],
      claimed: i.claimed_
    }
  }

  async pledgeOf (addr) {
    return this.contract.pledgeOf(addr)
  }

  async token () {
    const t = new Contract((await this.info()).token, abi.MockUSDT, this.provider)
    const [symbol, decimals] = await Promise.all([t.symbol(), t.decimals()])
    return { address: await t.getAddress(), symbol, decimals: Number(decimals) }
  }

  async bid (amount, inviteKey = null) {
    const me = await this.wallet.address()
    const info = await this.info()
    let invite = '0x'
    const previous = await this.pledgeOf(me)
    if (previous === 0n && info.inviteSigner !== '0x0000000000000000000000000000000000000000') {
      if (!inviteKey) throw new Error('Für diese Runde brauchst du einen Einladungslink.')
      const digest = await this.contract.inviteDigest(me)
      invite = await new KeyWallet(inviteKey).signMessage(getBytes(digest))
    }
    // Allowance first (USDT on mainnet needs a reset to 0 before changing it).
    const t = new Contract(info.token, abi.MockUSDT, this.provider)
    const allowance = await t.allowance(me, this.address)
    if (allowance < amount) {
      if (allowance !== 0n) await this.#approve(info.token, 0n)
      await this.#approve(info.token, amount)
    }
    return this.#call('bid', [amount, invite])
  }

  withdraw (amount) { return this.#call('withdraw', [amount]) }
  claim () { return this.#call('claim', []) }
  refund () { return this.#call('refund', []) }
  cancel () { return this.#call('cancel', []) }

  async #approve (token, amount) {
    const data = tokenIface.encodeFunctionData('approve', [this.address, amount])
    return sendAndWait(this.provider, this.wallet, token, data)
  }

  async #call (method, args) {
    const data = roundIface.encodeFunctionData(method, args)
    // Simulate first so the user gets a readable reason instead of a failed tx.
    try {
      await this.provider.call({ to: this.address, data, from: await this.wallet.address() })
    } catch (e) {
      throw explain(e)
    }
    return sendAndWait(this.provider, this.wallet, this.address, data)
  }
}

export async function sendAndWait (provider, wallet, to, data) {
  let tx
  try {
    tx = await wallet.send(to, data)
  } catch (e) {
    throw explain(e)
  }
  const receipt = await provider.waitForTransaction(tx.hash)
  if (!receipt || receipt.status !== 1) throw new Error('Transaktion fehlgeschlagen: ' + tx.hash)
  return receipt
}
