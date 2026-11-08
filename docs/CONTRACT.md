# Contracts

There are two contracts in `contracts/src`: Solidity 0.8.28, EVM version Paris, OpenZeppelin 5.0.2. Neither has admin rights, and neither is upgradeable.

## PomonaFactory

Deployed once per chain and permanently bound to one token (USDT).

| Function | Purpose |
|---|---|
| `createRound(mode, target, minBid, biddingEnd, interval, installments, inviteSigner)` | Creates a round. The caller becomes the organiser. `mode`: 0 = deposit upfront, 1 = by invoice. |
| `isRound(address) → bool` | **Registry.** The app only talks to rounds for which this is `true`. |
| `roundsOf(organizer) → address[]` | All rounds of an organiser |
| `token() → address` | The token of all rounds of this factory |

## PomonaRound

### Parameters (immutable)

| Field | Meaning |
|---|---|
| `mode` | How backers pay, see below: `Deposit` (deposit upfront) or `Invoice` (by invoice) |
| `target` | Target **per instalment** (e.g. 4,000 USDT per month) |
| `minBid` | Minimum pledge per instalment |
| `biddingEnd` | End of Phase 1, also the due date of the first invoice |
| `interval` | Time between invoices: 1 to 366 days. The app offers 7 days (week) and 30 days (month). |
| `installments` | How often the organiser may invoice: 1 to 520 |
| `inviteSigner` | Address of the invite key, or `0x0` for open rounds |

### Two ways to pay (`mode`)

| | Deposit: "deposit upfront" | Invoice: "by invoice" |
|---|---|---|
| When pledging | `amount × installments` goes into escrow | Nothing. The pledge is a commitment. |
| Invoice | The organiser calls `invoice()`, at most once per interval | Invoice `i` counts as issued automatically from `biddingEnd + i × interval` |
| Payment | `invoice()` pays one instalment of **all** pledges from escrow to the organiser | Each backer calls `pay(i)`. Their pledge goes directly from their wallet to the organiser. |
| Receipt | For all backers, as soon as the instalment is settled | Only for backers who called `pay(i)` |
| Target missed, cancellation | `refund()`: everything back | No invoices, nothing was paid |
| Early end | `refund()` of the instalments not yet settled | No new invoices. Issued ones remain payable. |
| Guarantee | The money is there | None: whoever does not pay, does not pay. The organiser sees open invoices. |

Open invoices remain payable, even after the round has ended, but each only once. If the balance is insufficient, `pay(i)` fails and there is no receipt.

### Phases

```
                 cancel()
   ┌─────────┐ ─────────────────────────────────────────┐
   │ Bidding │                                          ▼
   └────┬────┘   biddingEnd, total < target        ┌────────┐
        ├─────────────────────────────────────────▶│ Failed │  refund(): everything back
        │ biddingEnd, total ≥ target               └────────┘
        ▼
   ┌─────────┐   invoiceCount == installments
   │ Running │   or terminate()                 ┌───────────┐
   │         │ ────────────────────────────────▶│ Completed │  refund(): instalments not
   └─────────┘   or now ≥ expiresAt             └───────────┘  yet settled are returned
     invoice() at most once per interval
```

The phase is never stored; it is always computed from time and state (`phase()`). In Invoice mode there is no `invoice()` and no `refund()`. Running ends there with `terminate()` or at `expiresAt`.

### Functions

| Function | Who | Phase | Effect |
|---|---|---|---|
| `bid(amount, invite)` | anyone with a wallet, including the organiser | Bidding | Increase the pledge per instalment. Deposit: collects `amount × installments`. Invoice: only the commitment; payment happens per invoice. The invitation is checked on the first pledge. |
| `withdraw(amount)` | backer | Bidding | Lower the pledge (Deposit: refund `amount × installments`). The remainder must be 0 or ≥ `minBid`. |
| `invoice()` | organiser | Running | Deposit only: pays `total` to the organiser, from `biddingEnd + invoiceCount × interval` |
| `pay(i)` | backer | Running / Completed | Invoice only: pays the backer's own pledge for issued invoice `i` to the organiser (needs `approve`). Once per invoice. If the organiser has pledged themselves, their own payment is only recorded (receipt, `paidCount`, `paidSum`); nothing is transferred. |
| `invoiceCount() → n` | everyone | – | Issued invoices. Deposit: settled by the organiser. Invoice: by time, limited by `installments` and `terminate()`. |
| `issuedAt(i)` | everyone | – | Time at which invoice `i` was issued, otherwise 0 |
| `paidAt(backer, i)`, `paidCount(i)`, `paidSum(i)` | everyone | – | Invoice only: who has paid, how many, how much |
| `unpaid(i) → (backers[], amounts[])` | everyone | – | Invoice only: backers with an open invoice `i` |
| `terminate()` | organiser | Running | Ends invoicing early |
| `cancel()` | organiser | Bidding | Cancels the round; everything is returned |
| `refund()` | backer | Failed / Completed | Pays out `refundable(backer)`, once |
| `receipt(backer, i) → (amount, paidAt)` | everyone | – | Receipt for instalment `i`. `(0, 0)` if it has not been settled or (Invoice) not been paid, or if the backer did not take part. |
| `info()` | everyone | – | All key figures in one call |

### Invariants

- Deposit: the contract's balance is at least `total × (installments − invoiceCount)` as long as no refunds happen. Refunds only exist in Failed and Completed, and then there are no more invoices.
- A pledge no longer changes after `biddingEnd`. This keeps receipts stable.
- No money gets stuck: if the organiser never invoices, the round becomes Completed at `expiresAt` and everyone receives the rest.
- Tokens with a transfer fee are rejected (`UnsupportedToken`). USDT has such a switch, which is currently set to 0.
- Invoice: the contract never holds money. `pay` transfers directly from the backer to the organiser and checks that exactly the amount arrives.
- Invoice: a backer pays at most once per invoice and never more than their pledge.
- All functions that move money are `nonReentrant` and follow checks-effects-interactions.

### Events

`Bid`, `Withdrawn`, `Invoiced(index, amount, at)`, `Paid(bidder, index, amount, at)`, `Refunded`, `Cancelled`, `Terminated`, and in the factory `RoundCreated(round, organizer)`.

### Errors

`BadParams`, `WrongPhase`, `NotOrganizer`, `ZeroAmount`, `BelowMinBid`, `InvalidInvite`, `TooMuch`, `NotDue`, `NothingToRefund`, `UnsupportedToken`, `WrongMode`, `NotIssued`, `NotBidder`, `AlreadyPaid`. The app translates them in `app/core/chain/reverts.js`.

## Build, test, deploy

```bash
cd contracts
npm install
npm test                                   # compiles and runs 20 tests
npm run chain                              # local chain on :8545
node scripts/deploy.js local               # MockUSDT + factory → app/core/config/deployments.js
RPC=… PRIVATE_KEY=… node scripts/deploy.js sepolia
RPC=… PRIVATE_KEY=… TOKEN=0xdAC17F958D2ee523a2206206994597C13D831ec7 node scripts/deploy.js ethereum
```

Before any mainnet use: an external audit, see [SECURITY.md](SECURITY.md).
