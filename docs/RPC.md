# RPC between UI and worker

The protocol is JSON, one message per line, between renderer and Bare worker (Electron IPC via `electron/preload.cjs` and `electron/main.cjs`, then `Bare.IPC`). It is implemented in `app/core/rpc/server.js` and `app/ui/electron.js`. **Only** the methods below are reachable (`app/core/rpc/methods.js`). Every parameter is checked against a schema.

```json
→ {"id":1,"method":"bid","params":{"amount":"100"}}
← {"id":1,"result":null}
← {"id":2,"error":{"code":"BELOW_MIN","message":"The minimum pledge is 25 USDT per instalment."}}
← {"event":"change"}
```

Events: `ready`, `change` (the status may have changed) and `error` (error in the background).

## Methods

| Method | Parameters | Result |
|---|---|---|
| `status` | – | see below |
| `createWallet` | `password` | `{ seed, address }`. The seed is returned **only here**, once. |
| `restoreWallet` | `seed`, `password` | `{ address }`. Only possible if no wallet exists yet. |
| `unlock` | `password` | `{ address }` |
| `lock` | – | – |
| `revealSeed` | `password` | seed as a string |
| `sendUsdt` | `to`, `amount`, `password` | `{ hash }` |
| `faucet` | – | Local chain only: 5,000 test USDT |
| `createRound` | `title`, `website?` (http/https only, e.g. `example.com`), `mode?` (`invoice` = by invoice, `deposit` = deposit upfront, default `deposit`), `network?`, `target`, `minBid?`, `interval` (`week`/`month`), `installments`, `biddingEnd` (Unix seconds) or `biddingDays`, `guide?` (suggested amount per instalment), `inviteOnly?` | `{ link }` |
| `join` | `link` | status |
| `quoteBid` | `amount` (per instalment) | `{ amount, pledgeAfter, installments, deposit, fee, balance, enough, missing, symbol }`. Only calculates, sends nothing. `fee` is the network fee in USDT (`null` on the local chain). |
| `bid` | `amount` (per instalment) | – |
| `withdraw` | `amount` or `"all"` | – |
| `invoice` | – | – (organiser, `deposit` only) |
| `quotePay` | `index?` (0-based, otherwise all open ones) | `{ invoices: [3], amount, self, fee, balance, enough, missing, symbol }`. `invoice` only; `enough` also takes the fee into account. `self`: the organiser's own invoice, which is only recorded; nothing is transferred. |
| `pay` | `index?` | – Pays open invoices from the user's own wallet to the organiser (approval and payment in one signature). Afterwards there is a receipt. |
| `invoiceDetails` | `index` | `{ index, dueAt, paidCount, paidSum, total, bidders, unpaid: [{ bidder, amount }], symbol }` (organiser, `invoice` only) |
| `terminate` | – | – (organiser) |
| `cancel` | – | – (organiser) |
| `refund` | – | – |
| `postNews` | `text` | – (organiser) |
| `invite` | – | `{ link, qr }` (all participants; shared during Phase 1) |
| `receipt` | `index` (0-based) | `{ code, qr, validUntil }`. The code is signed by the account and valid for 10 minutes. |
| `verifyReceipt` | `code` | `{ valid, reason? , title?, installment, installments, amount, symbol, paidAt, bidder, round }` |
| `qr` | `text` | SVG markup |
| `assistantAsk` | `text` (max. 500) or `topic` (suggestion) | `{ reply, actions, source }`. `actions` are only suggestions (`bid`, `open`, `receipt`, `invoice`, `withdraw`, `refund`, `news`, `install`), checked against role and phase. `source`: `topic`, `rules`, `model`, `faq`, `none`. |
| `assistantInstall` | `model` (`small`/`better`) | Starts download and loading in the background; progress via `status().assistant` |
| `assistantReset` | – | Forgets the conversation (also happens on lock) |

Amounts are strings in German or English notation, i.e. `"1.234,56"`, `"12,5"` or `"12.5"`.

## `status()`

```js
{
  wallet: {
    state: 'none' | 'locked' | 'unlocked',
    kind: 'smart' | 'dev' | null,
    address: '0x…' | null,
    usdt: '2400' | null,
    symbol: 'USDT'
  },
  network: { id: 'sepolia', name: 'Ethereum Sepolia (Test)', dev: false, explorer: 'https://…' },
  networks: [{ id, name, ready }],        // ready = factory + token (+ bundler/paymaster) configured
  peers: 6,                               // Hyperswarm connections
  version: '0.3.0',
  assistant: {                            // "Ask Pomona"
    state: 'none' | 'installed' | 'downloading' | 'loading' | 'ready' | 'error',
    model: 'small' | 'better' | null, progress: 0.34 | null, error: null,
    models: [{ key, label, size, note, file, url }],
    manual: null | { dir },               // developer mode: model as a file from this folder
    missing: false,                       // true: the file is not in the folder yet
    suggestions: [{ topic, question }]    // matching role and phase
  },
  busy: null | 'bid' | 'invoice' | …,     // running transaction
  busyStep: null | 'prepare' | 'sign' | 'confirm', // progress of the running transaction
  round: null | {
    mode: 'invoice' | 'deposit',          // by invoice or deposited upfront
    role: 'organizer' | 'bidder',
    title, website,                       // website: http(s) or null, shown as an icon next to the title
    guide: '100' | null,                  // suggested amount per instalment (from the manifest, display only)
    verified: true,                       // manifest organiser == contract organiser
    address, organizer, symbol,
    target, total, minBid,                // per instalment, as strings
    progress: 0.81,                       // total / target
    interval: 2592000, intervalName: 'month' | 'week' | null,
    installments: 12, invoiceCount: 3,
    biddingEnd, nextInvoiceAt, expiresAt, now,   // Unix seconds (chain time)
    phase: 'bidding' | 'failed' | 'running' | 'completed',
    canInvoice: true,
    inviteOnly: true,
    bidders: 27,
    average: '120.37', median: '108',     // per instalment, over all current pledges (null without pledges)
    myPledge: '100',                      // per instalment
    myDeposit: '1200',                    // myPledge × installments (by invoice: '0')
    openInvoices: 1, openAmount: '100',   // by invoice: my open invoices
    refundable: '0',
    invoices: [{ index, dueAt, paidAt, amount, status, mine, paidCount?, paidSum? }], // plan of the round page: the organiser always sees the whole round, everyone else their own pledge
    myInvoices: [ … ],                    // own instalments (receipts, open invoices); [] without a pledge
    // status: deposit upfront  "paid" | "due" | "scheduled" | "void"
    //         by invoice       backer: "paid" | "open" | "scheduled" | "void"
    //                          organiser: "issued" (with paidCount, paidSum) | "scheduled" | "void"
    biddingStart,                         // from the manifest (display only)
    news: [{ text, at }]                  // newest first
  }
}
```

## Error codes (selection)

`WRONG_MODE`, `NOT_BIDDER`, `WRONG_PASSWORD`, `WEAK_PASSWORD`, `LOCKED`, `NO_WALLET`, `WALLET_EXISTS`, `BAD_SEED`, `BAD_AMOUNT`, `BAD_LINK`, `BAD_PARAMS`, `NO_METHOD`, `NOT_READY`, `NOT_DEV`, `FORGED_ROUND`, `NO_PEERS`, `NO_INVITE`, `NO_FUNDS`, `BELOW_MIN`, `NOT_DUE`, `WRONG_PHASE`, `NOT_ORGANIZER`, `POLICY`, `FEE_TOO_HIGH`, `NO_USDT_FOR_FEE`, `BUSY`, `TX_FAILED`, `REVERT_<ContractError>`.
