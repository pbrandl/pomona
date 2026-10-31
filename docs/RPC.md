# RPC zwischen UI und Worker

Das Protokoll ist JSON, eine Nachricht pro Zeile, über die `pear-pipe` zwischen Renderer und Bare-Worker. Implementiert ist es in `app/core/rpc/server.js` und `app/ui/pear.js`. Erreichbar sind **nur** die Methoden unten (`app/core/rpc/methods.js`). Jeder Parameter wird gegen ein Schema geprüft.

```json
→ {"id":1,"method":"bid","params":{"amount":"100"}}
← {"id":1,"result":null}
← {"id":2,"error":{"code":"BELOW_MIN","message":"Das Mindestgebot ist 25 USDT pro Rate."}}
← {"event":"change"}
```

Events: `ready`, `change` (der Status kann sich geändert haben) und `error` (Fehler im Hintergrund).

## Methoden

| Methode | Parameter | Ergebnis |
|---|---|---|
| `status` | – | siehe unten |
| `createWallet` | `password` | `{ seed, address }`. Der Seed wird **nur hier** einmal zurückgegeben. |
| `restoreWallet` | `seed`, `password` | `{ address }`. Nur möglich, wenn noch keine Wallet existiert. |
| `unlock` | `password` | `{ address }` |
| `lock` | – | – |
| `revealSeed` | `password` | Seed als String |
| `sendUsdt` | `to`, `amount`, `password` | `{ hash }` |
| `faucet` | – | Nur auf der lokalen Chain: 5.000 Test-USDT |
| `createRound` | `title`, `description?`, `network?`, `target`, `minBid?`, `interval` (`week`/`month`), `installments`, `biddingEnd` (Unix-Sekunden) oder `biddingDays`, `guide?` (Richtwert pro Rate), `inviteOnly?` | `{ link }` |
| `join` | `link` | Status |
| `quoteBid` | `amount` (pro Rate) | `{ amount, pledgeAfter, installments, deposit, fee, balance, enough, missing, symbol }`. Rechnet nur, sendet nichts. `fee` ist die Netzwerkgebühr in USDT (`null` auf der lokalen Chain). |
| `bid` | `amount` (pro Rate) | – |
| `withdraw` | `amount` oder `"all"` | – |
| `invoice` | – | – (Organisator) |
| `terminate` | – | – (Organisator) |
| `cancel` | – | – (Organisator) |
| `refund` | – | – |
| `postNews` | `text` | – (Organisator) |
| `invite` | – | `{ link, qr }` (Organisator) |
| `receipt` | `index` (0-basiert) | `{ code, qr }` |
| `verifyReceipt` | `code` | `{ valid, reason? , title?, installment, installments, amount, symbol, paidAt, bidder, round }` |
| `qr` | `text` | SVG-Markup |

Beträge sind Strings in deutscher oder englischer Schreibweise, also `"1.234,56"`, `"12,5"` oder `"12.5"`.

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
  networks: [{ id, name, ready }],        // ready = Factory + Token (+ Bundler/Paymaster) konfiguriert
  peers: 6,                               // Hyperswarm-Verbindungen
  busy: null | 'bid' | 'invoice' | …,     // laufende Transaktion
  busyStep: null | 'prepare' | 'sign' | 'confirm', // Fortschritt der laufenden Transaktion
  round: null | {
    role: 'organizer' | 'bidder',
    title, description,
    guide: '100' | null,                  // Richtwert pro Rate (aus dem Manifest, nur Anzeige)
    verified: true,                       // Manifest-Organisator == Contract-Organisator
    address, organizer, symbol,
    target, total, minBid,                // pro Rate, als Strings
    progress: 0.81,                       // total / target
    interval: 2592000, intervalName: 'month' | 'week' | null,
    installments: 12, invoiceCount: 3,
    biddingEnd, nextInvoiceAt, expiresAt, now,   // Unix-Sekunden (Chain-Zeit)
    phase: 'bidding' | 'failed' | 'running' | 'completed',
    canInvoice: true,
    inviteOnly: true,
    bidders: 27,
    myPledge: '100',                      // pro Rate
    myDeposit: '1200',                    // myPledge × installments
    refundable: '0',
    invoices: [{ index, dueAt, paidAt, amount, status: "paid"|"due"|"scheduled"|"void", mine }],
    biddingStart,                         // aus dem Manifest (nur Anzeige)
    news: [{ text, at }]                  // neueste zuerst
  }
}
```

## Fehlercodes (Auswahl)

`WRONG_PASSWORD`, `WEAK_PASSWORD`, `LOCKED`, `NO_WALLET`, `WALLET_EXISTS`, `BAD_SEED`, `BAD_AMOUNT`, `BAD_LINK`, `BAD_PARAMS`, `NO_METHOD`, `NOT_READY`, `NOT_DEV`, `FORGED_ROUND`, `NO_PEERS`, `NO_INVITE`, `NO_FUNDS`, `BELOW_MIN`, `NOT_DUE`, `WRONG_PHASE`, `NOT_ORGANIZER`, `POLICY`, `FEE_TOO_HIGH`, `NO_USDT_FOR_FEE`, `BUSY`, `TX_FAILED`, `REVERT_<ContractError>`.
