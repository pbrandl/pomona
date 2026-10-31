/**
 * The account abstraction the rest of the app works with. Two implementations:
 *
 *  - SmartAccount (smart-account.js): ERC-4337 Safe via WDK, fees in USDT via
 *    a token paymaster. Used on every real network.
 *  - DevAccount (dev-account.js): plain WDK EVM account for the local Hardhat
 *    chain, where no bundler/paymaster exists. Gas is topped up invisibly.
 *
 * New chains (TON, Tron, …) or payment rails (Lightning) plug in by
 * implementing the same interface.
 *
 * @module core/wallet/account
 */

/**
 * @typedef {import('../chain/contracts.js').Call} Call
 */

/**
 * @typedef {Object} Account
 * @property {'smart'|'dev'} kind
 * @property {() => Promise<string>} address
 *   The address that holds USDT and appears as msg.sender in the contracts.
 * @property {() => Promise<bigint>} usdtBalance
 * @property {(calls: Call[]) => Promise<{ hash: string }>} execute
 *   Executes the calls in order (atomically on smart accounts) and resolves once
 *   they are included. Rejects if anything reverts.
 * @property {(calls: Call[]) => Promise<bigint|null>} quoteFee
 *   Expected fee in USDT base units, or null if fees are not paid in USDT.
 * @property {(to: string, amount: bigint) => Promise<{ hash: string }>} sendUsdt
 * @property {() => void} dispose
 */

export {}
