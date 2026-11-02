/**
 * WDK transaction policy: the wallet may only do what Pomona needs.
 *
 * WDK policies are default-deny on governed accounts. This one allows exactly:
 *  - batched calls whose targets are
 *      • the current round (any function: bid, withdraw, invoice, refund, …),
 *      • the factory (createRound only),
 *      • USDT with `approve(<current round>, …)` only;
 *    and never with a native value;
 *  - `transfer` of USDT (the "Senden" button in the wallet);
 *  - `sign` of receipt messages only ("pomona-beleg:v2:…"), never anything else;
 *  - `waitForTransaction`.
 *
 * Even a compromised UI or a bug in the core cannot make the wallet approve a
 * foreign contract or send funds anywhere else through sendTransaction.
 *
 * @module core/wallet/policy
 */

import { Interface } from 'ethers'
import abi from '../chain/abi.js'

const SELECTOR = {
  approve: '0x095ea7b3',
  createRound: new Interface(abi.PomonaFactory).getFunction('createRound').selector
}

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/**
 * @typedef {Object} PolicyTargets
 * @property {() => string|null} token   - USDT address
 * @property {() => string|null} factory - PomonaFactory address
 * @property {() => string|null} round   - current round (null before one exists)
 */

/**
 * @param {{ to?: string, value?: bigint|number|string, data?: string }} call
 * @param {PolicyTargets} t
 * @returns {boolean}
 */
export function isAllowedCall (call, t) {
  if (!call || typeof call.to !== 'string') return false
  if (BigInt(call.value ?? 0) !== 0n) return false
  const data = String(call.data || '0x').toLowerCase()
  const selector = data.slice(0, 10)
  if (same(call.to, t.round())) return true
  if (same(call.to, t.factory())) return selector === SELECTOR.createRound
  if (same(call.to, t.token())) {
    if (selector !== SELECTOR.approve || data.length < 74) return false
    const spender = '0x' + data.slice(34, 74)
    return same(spender, t.round())
  }
  return false
}

/**
 * @param {PolicyTargets} t
 * @returns {object} A WDK policy definition for `wdk.registerPolicy`.
 */
export function pomonaPolicy (t) {
  return {
    id: 'pomona',
    name: 'Pomona: nur USDT, Factory und die eigene Runde',
    scope: 'project',
    rules: [
      {
        name: 'pomona-contracts-only',
        operation: 'sendTransaction',
        action: 'ALLOW',
        conditions: [({ args }) => {
          const calls = Array.isArray(args[0]) ? args[0] : [args[0]]
          return calls.length > 0 && calls.every((c) => isAllowedCall(c, t))
        }]
      },
      {
        name: 'usdt-transfers-only',
        operation: 'transfer',
        action: 'ALLOW',
        conditions: [({ args }) => !!args[0] && same(args[0].token, t.token())]
      },
      {
        name: 'sign-receipts-only',
        operation: 'sign',
        action: 'ALLOW',
        conditions: [({ args }) => typeof args[0] === 'string' && args[0].startsWith('pomona-beleg:v2:')]
      },
      { name: 'wait-for-receipts', operation: 'waitForTransaction', action: 'ALLOW', conditions: [] }
    ]
  }
}
