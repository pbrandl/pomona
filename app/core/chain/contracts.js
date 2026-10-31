/**
 * Typed wrappers around the deployed contracts: reads go through the provider,
 * writes are returned as plain `{ to, data }` calls that a wallet account
 * executes (batched into one user operation on smart accounts).
 * @module core/chain/contracts
 */
import { Contract, Interface, ZeroAddress } from 'ethers'
import abi from './abi.js'
import { PHASES } from '../schedule.js'

/** @typedef {{ to: string, data: string }} Call */

const roundIface = new Interface(abi.PomonaRound)
const factoryIface = new Interface(abi.PomonaFactory)
const erc20Iface = new Interface(abi.ERC20)

/**
 * @typedef {Object} RoundInfo
 * @property {string} address
 * @property {string} token
 * @property {string} organizer
 * @property {bigint} target        - per installment
 * @property {bigint} minBid        - per installment
 * @property {number} biddingEnd
 * @property {number} interval
 * @property {number} installments
 * @property {string|null} inviteSigner
 * @property {bigint} total         - sum of bids per installment
 * @property {number} bidderCount
 * @property {number} invoiceCount
 * @property {number} nextInvoiceAt
 * @property {number} expiresAt
 * @property {'bidding'|'failed'|'running'|'completed'} phase
 */

export class RoundContract {
  /**
   * @param {string} address
   * @param {import('ethers').Provider} provider
   */
  constructor (address, provider) {
    this.address = address
    this.contract = new Contract(address, abi.PomonaRound, provider)
  }

  /** @returns {Promise<RoundInfo>} */
  async info () {
    const i = await this.contract.info()
    return {
      address: this.address,
      token: i.token,
      organizer: i.organizer,
      target: i.target,
      minBid: i.minBid,
      biddingEnd: Number(i.biddingEnd),
      interval: Number(i.interval),
      installments: Number(i.installments),
      inviteSigner: i.inviteSigner === ZeroAddress ? null : i.inviteSigner,
      total: i.total,
      bidderCount: Number(i.bidderCount),
      invoiceCount: Number(i.invoiceCount),
      nextInvoiceAt: Number(i.nextInvoiceAt),
      expiresAt: Number(i.expiresAt),
      phase: PHASES[Number(i.phase)]
    }
  }

  /** @param {string} who @returns {Promise<bigint>} per installment */
  pledgeOf (who) { return this.contract.pledgeOf(who) }

  /** @param {string} who @returns {Promise<bigint>} */
  refundable (who) { return this.contract.refundable(who) }

  /** @param {string} who @returns {Promise<string>} */
  inviteDigest (who) { return this.contract.inviteDigest(who) }

  /**
   * @param {string} who
   * @param {number} index
   * @returns {Promise<{ amount: bigint, paidAt: number }>}
   */
  async receipt (who, index) {
    const [amount, paidAt] = await this.contract.receipt(who, index)
    return { amount, paidAt: Number(paidAt) }
  }

  /** @param {bigint} amount @param {string} invite @returns {Call} */
  bid (amount, invite) { return { to: this.address, data: roundIface.encodeFunctionData('bid', [amount, invite]) } }
  /** @param {bigint} amount @returns {Call} */
  withdraw (amount) { return { to: this.address, data: roundIface.encodeFunctionData('withdraw', [amount]) } }
  /** @returns {Call} */
  invoice () { return { to: this.address, data: roundIface.encodeFunctionData('invoice', []) } }
  /** @returns {Call} */
  refund () { return { to: this.address, data: roundIface.encodeFunctionData('refund', []) } }
  /** @returns {Call} */
  cancel () { return { to: this.address, data: roundIface.encodeFunctionData('cancel', []) } }
  /** @returns {Call} */
  terminate () { return { to: this.address, data: roundIface.encodeFunctionData('terminate', []) } }
}

export class FactoryContract {
  /**
   * @param {string} address
   * @param {import('ethers').Provider} provider
   */
  constructor (address, provider) {
    this.address = address
    this.contract = new Contract(address, abi.PomonaFactory, provider)
  }

  /**
   * Only rounds deployed by this factory are genuine PomonaRound contracts.
   * Anything else (e.g. from a forged invite link) must never receive an approval.
   * @param {string} round
   * @returns {Promise<boolean>}
   */
  isRound (round) { return this.contract.isRound(round) }

  /** @returns {Promise<string>} */
  token () { return this.contract.token() }

  /** @param {string} organizer @returns {Promise<string[]>} */
  async roundsOf (organizer) { return [...await this.contract.roundsOf(organizer)] }

  /**
   * @param {{ target: bigint, minBid: bigint, biddingEnd: number, interval: number, installments: number, inviteSigner: string|null }} p
   * @returns {Call}
   */
  createRound (p) {
    return {
      to: this.address,
      data: factoryIface.encodeFunctionData('createRound', [
        p.target, p.minBid, p.biddingEnd, p.interval, p.installments, p.inviteSigner ?? ZeroAddress
      ])
    }
  }
}

export class TokenContract {
  /**
   * @param {string} address
   * @param {import('ethers').Provider} provider
   */
  constructor (address, provider) {
    this.address = address
    this.contract = new Contract(address, abi.ERC20, provider)
  }

  /** @returns {Promise<{ address: string, symbol: string, decimals: number }>} */
  async meta () {
    const [symbol, decimals] = await Promise.all([this.contract.symbol(), this.contract.decimals()])
    return { address: this.address, symbol, decimals: Number(decimals) }
  }

  /** @param {string} who @returns {Promise<bigint>} */
  balanceOf (who) { return this.contract.balanceOf(who) }

  /** @param {string} owner @param {string} spender @returns {Promise<bigint>} */
  allowance (owner, spender) { return this.contract.allowance(owner, spender) }

  /** @param {string} spender @param {bigint} amount @returns {Call} */
  approve (spender, amount) { return { to: this.address, data: erc20Iface.encodeFunctionData('approve', [spender, amount]) } }

  /** @param {string} to @param {bigint} amount @returns {Call} */
  transfer (to, amount) { return { to: this.address, data: erc20Iface.encodeFunctionData('transfer', [to, amount]) } }
}
