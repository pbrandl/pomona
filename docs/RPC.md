# RPC zwischen UI und Worker

Das Protokoll ist JSON, eine Nachricht pro Zeile, zwischen Renderer und Bare-Worker (Electron-IPC über `electron/preload.cjs` und `electron/main.cjs`, dann `Bare.IPC`). Implementiert ist es in `app/core/rpc/server.js` und `app/ui/electron.js`. Erreichbar sind **nur** die Methoden unten (`app/core/rpc/methods.js`). Jeder Parameter wird gegen ein Schema geprüft.

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
| `createRound` | `title`, `website?` (nur http/https, z. B. `beispiel.de`), `mode?` (`invoice` = per Rechnung, `deposit` = vorab hinterlegen, Standard `deposit`), `network?`, `target`, `minBid?`, `interval` (`week`/`month`), `installments`, `biddingEnd` (Unix-Sekunden) oder `biddingDays`, `guide?` (Richtwert pro Rate), `inviteOnly?` | `{ link }` |
| `join` | `link` | Status |
| `quoteBid` | `amount` (pro Rate) | `{ amount, pledgeAfter, installments, deposit, fee, balance, enough, missing, symbol }`. Rechnet nur, sendet nichts. `fee` ist die Netzwerkgebühr in USDT (`null` auf der lokalen Chain). |
| `bid` | `amount` (pro Rate) | – |
| `withdraw` | `amount` oder `"all"` | – |
| `invoice` | – | – (Organisator, nur `deposit`) |
| `quotePay` | `index?` (0-basiert, sonst alle offenen) | `{ invoices: [3], amount, self, fee, balance, enough, missing, symbol }`. Nur `invoice`; `enough` berücksichtigt auch die Gebühr. `self`: die eigene Rechnung des Organisators, wird nur vermerkt, nichts wird überwiesen. |
| `pay` | `index?` | – Bezahlt offene Rechnungen aus der eigenen Wallet an den Organisator (Freigabe und Zahlung in einer Signatur). Danach gibt es den Beleg. |
| `invoiceDetails` | `index` | `{ index, dueAt, paidCount, paidSum, total, bidders, unpaid: [{ bidder, amount }], symbol }` (Organisator, nur `invoice`) |
| `terminate` | – | – (Organisator) |
| `cancel` | – | – (Organisator) |
| `refund` | – | – |
| `postNews` | `text` | – (Organisator) |
| `invite` | – | `{ link, qr }` (alle Teilnehmer; geteilt wird in der Bietphase) |
| `receipt` | `index` (0-basiert) | `{ code, qr, validUntil }`. Der Code ist vom Konto unterschrieben und 10 Minuten gültig. |
| `verifyReceipt` | `code` | `{ valid, reason? , title?, installment, installments, amount, symbol, paidAt, bidder, round }` |
| `qr` | `text` | SVG-Markup |
| `assistantAsk` | `text` (max. 500) oder `topic` (Vorschlag) | `{ reply, actions, source }`. `actions` sind nur Vorschläge (`bid`, `open`, `receipt`, `invoice`, `withdraw`, `refund`, `news`, `install`), geprüft gegen Rolle und Phase. `source`: `topic`, `rules`, `model`, `faq`, `none`. |
| `assistantInstall` | `model` (`small`/`better`) | Startet Download und Laden im Hintergrund, Fortschritt über `status().assistant` |
| `assistantReset` | – | Vergisst das Gespräch (passiert auch beim Sperren) |

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
  version: '0.3.0',
  assistant: {                            // „Frag Pomona“
    state: 'none' | 'installed' | 'downloading' | 'loading' | 'ready' | 'error',
    model: 'small' | 'better' | null, progress: 0.34 | null, error: null,
    models: [{ key, label, size, note, file, url }],
    manual: null | { dir },               // Entwicklermodus: Modell als Datei aus diesem Ordner
    missing: false,                       // true: Datei liegt noch nicht im Ordner
    suggestions: [{ topic, question }]    // passend zu Rolle und Phase
  },
  busy: null | 'bid' | 'invoice' | …,     // laufende Transaktion
  busyStep: null | 'prepare' | 'sign' | 'confirm', // Fortschritt der laufenden Transaktion
  round: null | {
    mode: 'invoice' | 'deposit',          // per Rechnung oder vorab hinterlegt
    role: 'organizer' | 'bidder',
    title, website,                       // website: http(s) oder null, als Icon neben dem Titel
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
    average: '120.37', median: '108',     // pro Rate, über alle aktuellen Gebote (null ohne Gebote)
    myPledge: '100',                      // pro Rate
    myDeposit: '1200',                    // myPledge × installments (per Rechnung: '0')
    openInvoices: 1, openAmount: '100',   // per Rechnung: meine offenen Rechnungen
    refundable: '0',
    invoices: [{ index, dueAt, paidAt, amount, status, mine, paidCount?, paidSum? }], // Plan der Rundenseite: Organisator immer die ganze Runde, sonst das eigene Gebot
    myInvoices: [ … ],                    // eigene Raten (Belege, offene Rechnungen); [] ohne Gebot
    // status: vorab hinterlegt  "paid" | "due" | "scheduled" | "void"
    //         per Rechnung      Bieter: "paid" | "open" | "scheduled" | "void"
    //                           Organisator: "issued" (mit paidCount, paidSum) | "scheduled" | "void"
    biddingStart,                         // aus dem Manifest (nur Anzeige)
    news: [{ text, at }]                  // neueste zuerst
  }
}
```

## Fehlercodes (Auswahl)

`WRONG_MODE`, `NOT_BIDDER`, `WRONG_PASSWORD`, `WEAK_PASSWORD`, `LOCKED`, `NO_WALLET`, `WALLET_EXISTS`, `BAD_SEED`, `BAD_AMOUNT`, `BAD_LINK`, `BAD_PARAMS`, `NO_METHOD`, `NOT_READY`, `NOT_DEV`, `FORGED_ROUND`, `NO_PEERS`, `NO_INVITE`, `NO_FUNDS`, `BELOW_MIN`, `NOT_DUE`, `WRONG_PHASE`, `NOT_ORGANIZER`, `POLICY`, `FEE_TOO_HIGH`, `NO_USDT_FOR_FEE`, `BUSY`, `TX_FAILED`, `REVERT_<ContractError>`.
