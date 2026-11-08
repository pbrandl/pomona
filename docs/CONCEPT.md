# Concept: round types, wallet service, swap service

**Status: concept, not implemented.** Written down in November 2026. First the
current app is built in Pear; afterwards work continues here.

## Goal

Pomona should be able to load different contracts that follow the same
mechanics (Phase 1 → target → instalments or invoices → receipts → completion
or refund) but need different UIs. The wallet is separated from the app and
offered as a service of its own. A swap service helps the wallet to pledge with
the right coins.

```
Pomona app                         Wallet service                 Swap service
rounds, P2P, round types,   ──►    keys, signing,           ──►   swap, bridge,
UI, assistant                      rules, confirmation,           buy (on-ramp)
only suggests calls                "top up"                       never with other people's money
```

## 1. Round types as modules

Today the differences between "deposit upfront" and "by invoice" sit in about
47 branches (`mode === 'invoice'`) across 13 files in core, UI and assistant.
Every further type would multiply this.

A round type is a package of four parts:

1. **Contract:** implements a common interface (phase, pledges, instalments,
   receipts, refund), may have its own functions and reports its type
   (e.g. `pomona.rechnung/1`). One factory per type, all in one registry per network.
2. **Core adapter** (`core/types/<type>/`): translates the contract into the
   common status format (phase, target, totals, `invoices`, `myInvoices`, …) plus
   type-specific data; lists its actions with checks, cost preview and calls.
   This determines the permissions the app requests from the wallet.
3. **UI** (`ui/types/<type>/`): assembles the round page from building blocks
   (header, ring, "Your pledge", timeline, news, Manage) and provides its own
   blocks, flows and words ("instalment", "invoice", "share").
4. **Assistant knowledge:** topics and commands of the type.

- **Detecting the type:** via the chain, not via the manifest. Invitation →
  round address → registry: which factory? → matching module. An unknown type
  leads to "This round needs a newer version of Pomona."
- **Code, not downloads:** types are code shipped with the app (reviewed,
  versioned, via Pear updates). Never load UI or core code from peers. Small
  variants of a type (words, default values) may come as data.
- **RPC:** `quote` and `act` with the name of the action instead of one method
  per action. The allowed actions remain a closed list that comes from the type.
- **Tests:** a shared suite for the interface against every contract and
  adapter, plus tests per type and mock scenarios per type for the design preview.

Order:

1. Extract the two current modes as the first types; the tests prove that
   nothing changes.
2. Contract: type identifier, factory per type, registry.
3. Type registry in the app, update notice for unknown types.
4. First new type as a proof.

## 2. The wallet as a separate service

Ground rule: **the app never signs itself.** It sends the wallet prepared calls
(e.g. approve 1,200 USDT to round 0x…, then `bid(100)`). The wallet decodes them
itself, shows them in an understandable way, and the user confirms there.
Everything that can go wrong in the app (manipulated peer data, a faulty round
type, a talked-into language model) no longer reaches the keys.

- **Starting point:** the dividing line already exists: the core prepares calls
  (`_prepareBid` → `calls`), `core/wallet/` executes them.
- **Product:** a Pear app of its own (desktop and phone) on WDK, with smart
  account, fees in the currency itself, seed phrase and its own confirmation UI.
- **Connection:** peer-to-peer via HyperDHT with an encrypted channel, paired
  via QR code, without relay servers. For example the wallet on the phone,
  Pomona on the laptop.
- **Sessions with permissions:** e.g. "Round 0x…: pledge, pay, withdraw, at most
  100 USDT per invoice". The rules (today `core/wallet/policy.js`) move into the
  wallet. Every movement of money is confirmed in the wallet.
- **Standards:** EIP-1193, EIP-5792 (batched calls), EIP-712 (signed data), so
  that the Pomona wallet also works with other dApps and Pomona also works with
  other wallets.
- **Stays in the app:** rounds, invitations (the invite key is not money),
  verifying receipts (chain query), reading balances (the address is public).
- **Transition:** first ship it in the same package, but separated (own Bare
  process, own storage, own confirmation); move to the phone later.

### Interchangeable connections

The app never talks directly to one specific wallet, but through connections
that hand over the same prepared calls:

1. **Pomona wallet** (P2P pairing).
2. **tether.wallet** (since 14 April 2026, WDK-based, USDT/XAUT on Ethereum,
   Polygon, Plasma, Arbitrum, USAT on Ethereum, Bitcoin with Lightning). Whether
   it accepts requests from apps (WalletConnect, deep link, own protocol) is
   open. **To be clarified with Tether.**
3. **WalletConnect** for other wallets.
4. **Payment address** for any wallet without a connection (see below).

Not recommended: entering the same seed phrase in two apps.

### Payment address (for wallets without a connection)

A normal transfer bypasses the round contract (no pledge, no receipt). Therefore
every backer gets their own payment address per round: a small forwarding
contract with a fixed address that can be computed in advance (CREATE2). They
simply send money there from their wallet, like a bank transfer with a payment
reference. A call forwards it into the round and records the pledge or payment
in their name, with a receipt.

**Decided:**

- **The sender always pays the fee.** It is included in the amount transferred
  ("Send 100.05 USDT: 100 invoice + 0.05 forwarding"). Anyone may trigger the
  forwarding (the person's app, the organiser, a relayer) and receives the fee
  for it; capped in the contract. Paid too much → the rest goes to the refund
  address. Too little → nothing is recorded, the money waits for a top-up.
- **Refunds go to a change address of the same wallet.** The wallet provides it
  when the payment address is created; it is fixed and cannot be redirected.
  Never use the sender address (with exchanges it belongs to the exchange).

**To note:** EVM has no change addresses like Bitcoin. The wallet must also
display a newly derived address, otherwise the refund looks lost.

## 3. Currencies and swap service

**Decided:** Pomona only uses **EURC, USDT and BTC** (low fees). Anyone paying
with other coins can swap, but bears the fees.

- **One currency per round,** fixed at creation (e.g. EURC for a project in the
  euro area). No conversion within a round.
- **EURC and USDT** on the same EVM mechanics. A chain with both is needed;
  according to secondary sources Arbitrum has EURC, to be checked against
  Circle's address list.
- **BTC:** no round contract on Bitcoin. Options:
  1. Pay with BTC, round in USDT or EURC (swap when paying). For the start.
  2. Wrapped BTC on the EVM chain (same mechanics, trust in the wrapper).
  3. A round type of its own via Lightning: every invoice a Lightning invoice,
     the preimage is the receipt; the bookkeeping then does not live in a contract.
- **Swap service:** the app reports the need ("1,200 USDT on Arbitrum for these
  calls"). The wallet offers: swap on the same chain (ideally batched: swap +
  approval + pledge with one confirmation), bring it from another chain (e.g.
  USDT0), buy (on-ramp). For "by invoice" also "swap and pay". Fixed maximums for
  slippage and fees, exact target amount. The service computes routes and builds
  calls; the wallet signs. WDK has modules for swaps and bridges (to check).
- **Regulation:** swapping as a service (especially for a fee) may require
  authorisation as a crypto-asset service provider under MiCA in the EU.
  Clarify early.

## Open questions

1. Ship the wallet bundled first (separated) or as its own app right away?
2. Should Pomona work with third-party wallets (MetaMask, Safe, …)?
3. tether.wallet: how does it accept requests from apps? (to be clarified with Tether)
4. EVM refund: a newly derived address (privacy, only with suitable wallets) or
   the main address (works everywhere)? Proposal: own wallet new address,
   third-party wallets main address.
5. Overpayment with "by invoice": refund it or keep it as credit for the next
   invoice?
6. Is "pay with BTC" via swap enough for the start?
7. Which two or three round types come next? What belongs to the "same
   mechanics" (also one-off payment, without a target, fixed prices)?
8. Should third parties be able to build round types?
