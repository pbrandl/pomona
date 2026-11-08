# Architecture

Pomona consists of three clearly separated parts:

```
┌──────────────── Desktop app (Electron + pear-runtime) ────────────────────┐
│                                                                           │
│  UI (Electron renderer)          Worker (Bare)                            │
│  app/ui/*                        app/worker/index.js → app/core/*         │
│  ┌────────────────────┐  RPC    ┌──────────────────────────────────────┐  │
│  │ views/*  (HTML)    │ ──────▶ │ rpc/      whitelist + validation     │  │
│  │ app.js   (state,   │ ◀────── │ pomona.js application service        │  │
│  │          actions)  │ events  │   ├─ wallet/  WDK accounts, vault,   │  │
│  └────────────────────┘         │   │           policy                  │  │
│  Preload ↔ Main ↔ Bare.IPC      │   ├─ chain/   read contracts,        │  │
│                                 │   │           encode calls            │  │
│                                 │   ├─ p2p/     Hyperswarm, manifest   │  │
│                                 │   └─ links, schedule, units, config  │  │
│                                 └──────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
          │ Hyperswarm (P2P)                         │ JSON-RPC / bundler
          ▼                                          ▼
   other participants                      EVM chain: PomonaFactory,
   (manifest, news)                        PomonaRound, USDT, paymaster
```

## Principles

1. **The chain is the source of truth for money.** Amounts, phases, schedule, organiser and receipts always come from the contract. Data from the P2P network (title, website, news) is only decoration. The app checks it against the contract and truncates it to fixed sizes.
2. **USDT only.** Users hold no other token. On real networks the wallet is an ERC-4337 smart account. A token paymaster takes the fee in USDT.
3. **The worker owns all secrets.** Seed, keys and network access live in the Bare worker. The UI only sees JSON and can only call the methods in `core/rpc/methods.js`.
4. **One round per app instance.** This keeps state, UI and security model simple.
5. **Runs in Node and Bare.** The core only uses packages that work in both runtimes. `core/bare.js` maps the Node built-ins following the pattern of the WDK packages. The tests run in Node, plus a smoke test in Bare.

## Modules

| Path | Role |
|---|---|
| `contracts/src/PomonaRound.sol` | Escrow and instalment settlement of one round, see [CONTRACT.md](CONTRACT.md) |
| `contracts/src/PomonaFactory.sol` | Creates rounds and is the `isRound` registry against forged contracts |
| `contracts/scripts/` | `build` (solc-js, also generates `app/core/chain/abi.js`), `devchain`, `deploy` |
| `app/electron/main.cjs` | Electron main process: window, starts the worker with `pear-runtime`, passes RPC between UI and worker (holds no keys) |
| `app/electron/preload.cjs` | The only door between the sandboxed renderer and the main process (`window.bridge`) |
| `app/worker/index.js` | Starts the core and serves RPC over `Bare.IPC` |
| `app/core/pomona.js` | **Application service.** All business rules, pre-checks, status |
| `app/core/wallet/` | `account.js` (interface), `smart-account.js` (ERC-4337), `dev-account.js` (local), `vault.js` (Argon2id + secretbox), `policy.js` (WDK policy) |
| `app/core/chain/` | `contracts.js` (read + encode calls), `reverts.js` (error texts), `provider.js`, `abi.js` (generated) |
| `app/core/p2p/` | `node.js` (Corestore, Hyperswarm, local settings), `manifest.js` (schema and sanitising) |
| `app/core/links.js` | Invitation links `pomona://` and receipts `pomona-beleg://` |
| `app/core/schedule.js` | Invoice schedule, mirrors the contract's rules |
| `app/core/units.js` | Parse amounts (German/English) and format them |
| `app/core/config/` | `networks.js` (chains, bundler, paymaster), `deployments.js` (generated), `limits.js` |
| `app/core/rpc/` | `server.js` (protocol), `methods.js` (whitelist with parameter schema) |
| `app/ui/` | `app.js` (state, actions, events), `views/*` (pure render functions), `format.js`, `pear.js` (bridge), `mock.js` (preview) |

## Flows

**Start a round (organiser)**
1. `createRound` checks the inputs and that the network is configured.
2. The wallet executes `factory.createRound(...)`. The new address is read via `factory.roundsOf(organizer)`.
3. The manifest is written to its own Hyperbee and announced on Hyperswarm.
4. The invitation link contains the manifest key, the network, the round address and optionally the invite key.

**Join (backer)**
1. Decode the link. The network must be known and configured.
2. `factory.isRound(round)` must be `true`, and the token must be USDT. Otherwise the app aborts (protection against forged contracts).
3. The invite key must match the contract's `inviteSigner`.
4. The manifest is loaded via Hyperswarm, from any peer that has it, and is then seeded in full.
5. Manifest and link must name the same round and chain. The status shows `verified` if the organiser matches as well.

**Pledge**
1. Pre-checks: phase, minimum pledge and a balance of at least `amount × instalments`.
2. The invite signature is created locally with the invite key, bound to chain, round and backer address.
3. The calls `[approve(round, amount×instalments), bid(amount, signature)]` go out on the smart account as **one** user operation; the fee is paid in USDT.

**Invoice (organiser)**
- `invoice()` is possible from `biddingEnd + i × interval`, at most `installments` times and only until `expiresAt`. Each invoice pays `total` (the sum of all pledges per instalment) to the organiser.

**Receipts**
- `receipt(index)` creates `pomona-beleg://{network, round, backer, index}` as a QR code.
- `verifyReceipt` checks the receipt against the contract: `isRound` and `receipt(backer, index)`. This works without a wallet and without the organiser.

## Status and events

The UI keeps no business state of its own. On every `change` event from the worker it calls `status()` and re-renders. `change` is triggered by the user's own actions, new manifest data and a poll timer (8 s, locally 1.5 s). The shape of `status()` is described in [RPC.md](RPC.md).

## Extending

| Goal | Where to start |
|---|---|
| **New EVM network** | Add an entry in `core/config/networks.js`, deploy the factory (`contracts/scripts/deploy.js`) and enter bundler and paymaster under `aa`. |
| **Another chain (TON, Tron, Solana)** | New account class following the interface in `core/wallet/account.js` with the matching WDK module, a contract counterpart, a `chain/` adapter. `pomona.js` only talks to these interfaces. |
| **Monthly invoices via Lightning** | New payment path next to `invoice()`: WDK `wdk-wallet-spark` in the worker. The invoice goes through the manifest (`news/` analogous to `invoices/`); the preimage serves as the receipt in `links.js`. |
| **Telegram** | A second adapter next to `rpc/server.js`: the bot runs in the organiser's worker and calls the same methods from `rpc/methods.js`. |
| **Mobile** | The core runs in Bare and therefore also in Bare Kit (iOS/Android). Only `ui/` has to be rebuilt; the RPC stays the same. |
| **New UI feature** | View function in `ui/views/`, button with `data-action`, entry in `actions` in `ui/app.js`, method in `core/rpc/methods.js` and `core/pomona.js`. |
| **Language** | See [Languages](#languages). |

## Conventions

- ES modules, JavaScript with JSDoc types, `standard` style (`npm run lint`).
- Errors the user sees are `PomonaError` with a stable code; `fail(code, key, params)` fetches the text `err.<key>` in the selected language.
- Amounts in the core are always `bigint` in base units. Strings only exist at the RPC boundary.
- Every business rule exists exactly once, in the contract. `schedule.js` only mirrors it for display.
- Tests: `contracts/test` (contract), `app/test/unit.test.js` (no network), `app/test/flow.test.js` (end-to-end), `app/test/bare.test.js` (Bare).

## Pear 3: Electron with pear-runtime

Since Pear 3, Pear no longer launches apps (`pear run` is gone). A Pear app is a regular Electron app that embeds `pear-runtime`: Bare worker, storage and P2P updates. Pomona follows the [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron) template:

- **Main process** (`electron/main.cjs`): opens the window, starts `worker/index.js` with `PearRuntime.run()` (the Bare runtime ships `bare-sidecar` for every platform) and passes the RPC lines through. It holds no keys and knows no business rules.
- **Preload** (`electron/preload.cjs`): provides `window.bridge` (start worker, write and receive lines, copy, camera, restart). The renderer runs with `sandbox`, `contextIsolation` and without Node.
- **Renderer**: `index.html` with `ui/electron.js`, which turns it into `window.pomona`.
- **Worker** (`worker/index.js`): core and RPC over `Bare.IPC`. On exit the main process sends SIGTERM; `graceful-goodbye` closes swarm and storage cleanly.
- **Start** (`scripts/start.js`, `npm start`): starts the local chain on 127.0.0.1:8545 if needed, deploys the contracts (or reuses existing ones) and opens Electron with `--dev --local <addresses>`.
- **Storage**: `<userData>/dev` with `--dev` (local chain), otherwise `<userData>/storage`. `--storage <dir>` sets a custom folder and thus allows a second instance.
- **Updates**: not set up yet; they come with packaging (see README).

## Two ways to start, one codebase

Core (`core/`) and UI (`ui/`, `index.html`) do not know Pear directly. They only talk to each other via `window.pomona` (`call`, `on`, `copy`, `cameraAccess`, `restart`) or the RPC protocol. This shell exists twice:

| | UI | Core |
|---|---|---|
| Desktop (`npm start`) | `ui/electron.js` via `electron/preload.cjs` and `electron/main.cjs` | `worker/index.js` (via `pear-runtime`) |
| Developer mode (`npm run dev`) | `ui/dev.js` (HTTP, server-sent events) | `worker/dev.js` (stdin/stdout), started by `scripts/dev.js` |
| Design preview (`npm run preview`) | `ui/mock.js` (simulated) | – |

New features therefore go into `core/` and `ui/` and run on every path. See [DEV.md](DEV.md).

## Live updates

`RoundContract.watch()` subscribes to all events of the round (Bid, Invoiced, …) via `eth_getLogs` polling at the network's `pollMs` (Arbitrum 1 s, Ethereum 4 s, local 0.1 s). Every event triggers `change`; the UI reloads the status. A 15 s timer keeps countdowns current. On Arbitrum, everyone sees a new pledge about 1–3 s after it is sent.

## Verifying receipts

The organiser opens "Verify receipt": camera (getUserMedia + jsQR, `ui/scanner.js`, `ui/vendor/jsqr.js`) or paste the code. The check always runs against the contract (`verifyReceipt`).

## Using the app: top-up, pledge, status, notifications

- **Top-up** (`ui/views/fund.js`): address with QR code, warnings (USDT only, correct network, never send to a round). The core watches `Transfer` events to the user's own address (`Pomona._watchFunds`, event `funds`), so an incoming payment shows up within seconds. After creating an empty wallet, the top-up page opens automatically.
- **Pledge: amount → review → done** (`ui/views/bid.js`): the "amount" step fills exactly the screen height: progress of the round with the user's own pledge as a segment, the number, a note, a keypad on touch devices and a directly focused field on desktop. Then `quoteBid` (deposit or invoices, fee, balance), then `bid`. Progress comes as `busyStep` (`prepare` → `sign` → `confirm`) from `Account.execute(calls, { onStep })`.
- **Pay** (`ui/views/pay.js`, "by invoice" rounds): review → done; without enough USDT, "Top up account" appears instead of a button that would fail.
- **"You" card** (`ui/views/you.js`): where do I stand, and what should I do now? In Phase 1 the "Your pledge" box with one button, otherwise one sentence and exactly one main action per role and phase ("Invoice 4 is due – send invoice", "900 USDT are waiting for you – withdraw").
- **Round view** (`ui/views/round.js`): every piece of information only once. Phase and deadline above the title, title on one line with website and invite (QR code, link), pledges below; ring with backers, average and median; the instalments as a timeline (received at the top, outstanding below, paid ones ticked, tap for receipt or payment); news, the latest one expanded; organiser tools as a list ("Manage").
- **Project page and pledge page:** anyone with a wallet can pledge, including the organiser. The organiser's round view is the project page: it always shows the whole round (totals, who has paid, Manage). Their own pledge lives on a separate pledge page (`ownPage`, reachable via "Manage") that shows exactly what every backer sees: "Your pledge", their own instalments, receipts and open invoices. For this the core provides `invoices` (the plan of the round page) and `myInvoices` (own instalments). The organiser's own invoice is only recorded in the contract; nothing is transferred.
- **Notifications** (`ui/notify.js`): `changes(prev, next)` compares two status snapshots (incoming funds, target reached/missed, new instalment with receipt, invoice due, new pledge, Phase 1 ends in 24 h, news). As a toast when the window is active, otherwise as a system notification. The user's own actions do not trigger a notification. Tested in `test/notify.test.js`.

## Pages instead of sidebars (one step, one page)

Every flow is a sequence of full pages with a step bar at the top (`page()` in `ui/views/parts.js`):

| Flow | Steps |
|---|---|
| Create account | password → seed phrase → top-up |
| Start a funding round | project → Phase 1 → instalments → review |
| Pledge | amount → review → done |
| Single pages | join, top-up, account, receipt, invoice, verify receipt |

An open page replaces the round view (`ui.sheet`). Its "← Back" is placed by `render()` at the top of the header, where the "Pomona" label would be, on one line with chat and balance. On phones the main button stays reachable at the bottom (`.actions.sticky`). Every view can be opened in the design preview (`npm run preview`).

## Maintaining the UI

- **One way for every page:** `page()` in `ui/views/parts.js`; register new pages in `SHEETS` (`ui/app.js`), buttons get a `data-action`, the action lives in `actions`.
- **Re-rendering:** `render()` rebuilds the HTML and reconciles it with Idiomorph. Unchanged nodes are kept, so a field keeps its focus and the phone keyboard stays open. Consequence: bind listeners on elements inside `#app` only once (`once()` in `ui/app.js`), otherwise they pile up with every status update.
- **Styles:** `ui/styles.css` is organised by area of the UI (tokens, base, header and pages, controls, round, pledge, pay, account, assistant, start page). Every selector exists once; phone variants sit in the block of their section. Change instead of append.
- **Renderer/core boundary:** the UI loads no core code (the dev server only serves `ui/` and `i18n/`). Small helpers such as parsing German amounts therefore exist twice: `core/decimal.js` and `ui/format.js` `num()` (for previews only).
- **No texts in code:** everything people read comes from `i18n/` via `t('area.key')` (see [Languages](#languages)).

## Languages

German, English and Spanish. The texts live in `app/i18n/<language>/`, one file per area: `core.js` (errors, receipt check, networks, dates), `agent.js` (assistant: answers, command patterns, prompt, tools), `ui.js` (interface). German is the reference and the fallback for missing keys.

- **Usage:** `t('wallet.title')`, with values `t('bid.missing', { amount, symbol })`. Plurals: `{ one, other }`, chosen via `n`. Lists (steps, months, keywords) with `raw()`. Values from outside (titles, addresses) are escaped by the view before insertion; the catalogue texts themselves may contain simple markup (`<strong>`).
- **Selection:** the saved choice (`localStorage` `pomona.lang`), otherwise the system language, otherwise German. Switch on the account page and on first start. The UI reports the language to the worker via the RPC `setLanguage`; the worker then writes errors and assistant answers in the same language.
- **Numbers** follow the language (`numbers` in `LANGUAGES`): German and Spanish `1.234,5`, English `1,234.5`. Display (`fmt`, `num`) and input (`core/decimal.js`, `ui/format.js` `num()`, commands in the assistant) read the same rule. The keypad always stores a dot internally and shows the language's separator. Dates follow the language.
- **Terms (German / English / Spanish):** Finanzierungsrunde = *funding round* / *ronda de financiación*, Gebot = *pledge* / *compromiso*, bieten = *pledge* / *comprometerse*, Phase 1 / Phase 2 = *Phase 1 / Phase 2* / *fase 1 / fase 2*, Rate = *installment* / *cuota*, Rechnung = *invoice* / *factura*, Beleg = *receipt* / *comprobante*, Treuhandkonto = *escrow* / *cuenta de garantía*, Richtwert = *suggested amount* / *importe orientativo*, Seedphrase = *seed phrase* / *frase semilla*. Spanish uses *tú*, without regional variants.
- **New language:** copy `i18n/de/` to `i18n/xx/`, translate the values (keys and `{placeholders}` stay), register it in `i18n/index.js` under `LANGUAGES`. The command patterns (`agent.match`) and keywords (`agent.topic.*.keywords`) depend on the language and need their own words. `npm test` (`test/i18n.test.js`) reports missing or extra keys and mismatched placeholders.

## "Ask Pomona" assistant (QVAC)

Details in [ASSISTANT.md](ASSISTANT.md). In short: `core/agent/` is a layer on top of the application service. It reads `status()`, calculates with `quoteBid()` and returns text plus *suggested* actions. The UI maps every action to an existing page (review page for pledges, confirmation for invoices and withdrawals). The language model runs via `@qvac/inference` directly in the Bare worker.
