# Pomona

[![Tests](https://github.com/pbrandl/pomona/actions/workflows/test.yml/badge.svg)](https://github.com/pbrandl/pomona/actions/workflows/test.yml)

**English** · [Deutsch](README.de.md)

**A decentralised funding round on Tether's stack, in USDT only.**

Someone starts a funding round for a project and sets the target per instalment, whether it is settled weekly or monthly, how many times, and **how backers pay**. Then they share a link. Anyone who joins pledges an amount per instalment.

**By invoice** (default, good for small projects): Pledging costs nothing. Once the target is reached, an invoice arrives automatically every week or month. Each backer pays it with a signature from their own account, directly to the organiser, and receives a receipt in return. No payment, no receipt. The organiser sees who has paid.

**Deposit upfront** (escrow): When pledging, all instalments are locked in a smart contract.

- **Target missed:** Everyone gets their money back.
- **Target reached:** The organiser invoices instalment by instalment, at most once per interval and at most as often as agreed. Each invoice releases one instalment from the contract to the organiser.
- **Receipts:** For every settled instalment, backers receive a receipt as a QR code that anyone can verify against the blockchain.
- **Early end:** Whatever has not been invoiced goes back to the backers.

There is no server and no account, and nobody needs to hold any token other than USDT.

Pomona is the successor to [Contrib](https://github.com/pbrandl/contrib) (Flutter + Parse Server) and is meant as a technical showcase.

Authored by Claude, prompted by [pbrandl](https://github.com/pbrandl).

<p align="center"><img src="docs/bidder.png" alt="A funding round from a backer's point of view" width="320"></p>

| Organiser invoices | Instalment timeline | Receipt as QR code |
|---|---|---|
| ![](docs/organizer-invoice.png) | ![](docs/receipts.png) | ![](docs/receipt.png) |

## Technology

| Layer | Technology | Role |
|---|---|---|
| Desktop app | [Pear](https://pears.com) 3: Electron with `pear-runtime` | UI in a sandboxed renderer. Wallet, P2P and chain run in a Bare worker started by `pear-runtime`. |
| P2P | Hyperswarm, Corestore, Hyperbee | The organiser publishes the manifest (title, website, news). All participants replicate and seed it. |
| Wallet | [WDK](https://docs.wdk.tether.io): `wdk`, `wdk-wallet-evm-erc-4337` | Self-custodial smart account (Safe). Fees are paid in USDT via a paymaster; a WDK policy limits what the account may do. |
| Vault | libsodium: Argon2id + XSalsa20-Poly1305 | The seed phrase is only ever stored encrypted. |
| Money | `PomonaRound`, `PomonaFactory` (Solidity) | Escrow, instalment settlement and receipts, without admin keys. |
| Assistant | [QVAC](https://qvac.tether.io) (`@qvac/inference`, llama.cpp) | "Ask Pomona": explains the round and prepares steps. Runs locally; the model (Qwen3) is downloaded once, peer-to-peer. The user always has to confirm. |

More detail:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): modules, flows and how to extend Pomona
- [docs/CONTRACT.md](docs/CONTRACT.md): phases, functions and invariants of the contracts
- [docs/SECURITY.md](docs/SECURITY.md): threat model, review findings and open risks
- [docs/RPC.md](docs/RPC.md): interface between UI and worker, status format
- [docs/DEV.md](docs/DEV.md): developer mode without Pear, language model as a file
- [docs/ASSISTANT.md](docs/ASSISTANT.md): the "Ask Pomona" assistant (QVAC), tools, limits, security
- [docs/CONCEPT.md](docs/CONCEPT.md): concept (not yet implemented): round types, wallet service, swap service

## Getting started

Requirements: Node.js 22. Since Pear 3 the app is a regular Electron app with `pear-runtime` (template: [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron)); `pear run` no longer exists. The Pear CLI is only needed for publishing.

```bash
# Build and test the contracts (20 tests)
cd contracts && npm install && npm test

# Test and start the app (47 tests)
cd ../app && npm install && npm test
npm start                             # starts a local chain + contracts and opens the window
npm run start:second                  # second instance with its own wallet (uses the same chain)
```

`npm start` builds the contracts, starts the local chain on 127.0.0.1:8545 and deploys them if no chain is running there yet. A running chain with its contracts is reused. The chain stops when the window that started it is closed.

`npm install` downloads Electron. If that fails behind a corporate firewall with a certificate error, `NODE_EXTRA_CA_CERTS=/path/to/corporate-certificate.pem npm install` helps. Developer tools in the window open with ⌥⌘I (macOS) or Ctrl+Shift+I.

In developer mode the app runs against the local chain. The wallet has a **faucet** for test USDT. The app silently tops up the ETH fees there, because there is no bundler or paymaster locally.

### Without Pear (e.g. behind a corporate firewall)

```bash
cd contracts && npm install && cd ../app && npm install
npm run dev     # local chain, local P2P network, core in Bare, two profiles in the browser
```

Same code as in Pear, just in the browser and fully offline. There, the language model comes as a file from `~/pomona-models`. Instructions: [docs/DEV.md](docs/DEV.md).

### Testnet and mainnet

1. Deploy the factory:
   ```bash
   cd contracts
   RPC=https://ethereum-sepolia-rpc.publicnode.com PRIVATE_KEY=0x… node scripts/deploy.js sepolia
   ```
   On testnets, a test USDT with a public `mint` is deployed alongside. For real USDT, set `TOKEN=0x…`.
2. In `app/core/config/networks.js`, enter a bundler and a **USDT token paymaster** under `aa`, for example from Candide or Pimlico (see the [WDK configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration)).
3. Start the app without `--dev`. Networks that are not fully configured cannot be selected.

### Design preview without Pear

```bash
cd app && npm run preview   # http://localhost:4173/preview.html?s=bidder
```

Scenarios: `onboarding`, `locked`, `start`, `bidder`, `organizer`, `invoice`, `receipts`, `completed`, `failed`. By invoice: `payg-bidding`, `payg`, `payg-organizer`.

## Quality

- `npm test` in `contracts/` runs 20 tests: both payment modes (deposit upfront, by invoice), schedule, catch-up invoices, receipts, refunds on cancellation, expiry and missed target, invitations (including reuse in another round), fee tokens, factory registry and parameter checks.
- `npm test` in `app/` runs 47 tests:
  - Unit tests: amounts, links, schedule, policy, vault, manifest sanitising, RPC validation, notifications
  - Assistant: commands, knowledge, role and phase checks for every action, prompt injection, no tools that move money
  - End-to-end with a real chain, WDK and Hyperswarm: "by invoice" round (payment, insufficient balance, open invoices), instalment round including joining while the organiser is offline, receipts, forged rounds, policy block, sending and locking
  - a test that runs the core **in Bare**, including QVAC
- `npm run lint` in `app/` checks the code with [standard](https://standardjs.com).
- [GitHub Actions](.github/workflows/test.yml) runs both test suites and the linter on every push.

## Status

- [x] Contracts with instalments, invoices, receipts and factory registry
- [x] USDT only: ERC-4337 smart account with fees via the paymaster (WDK)
- [x] Vault, lock, WDK policy, CSP and security review ([SECURITY.md](docs/SECURITY.md))
- [x] Desktop app on Pear 3 (Electron + `pear-runtime`), account → round → pledge flow verified in a real window
- [ ] Packaging (electron-forge) and P2P updates via `pear-runtime` with a release link
- [ ] Sepolia: configure bundler and paymaster and test the full flow
- [ ] Automatic lock on inactivity, stronger Argon2id parameters
- [x] "Ask Pomona" assistant on QVAC (local, preparing steps only)
- [x] German, English and Spanish, extensible (`app/i18n/`, see [ARCHITECTURE.md](docs/ARCHITECTURE.md#languages))
- [ ] Test the assistant with a real model on a desktop (quality in German and Spanish, tool calls)
- [ ] Have the Spanish texts proofread by native speakers
- [ ] Telegram bot in the organiser's worker
- [ ] External audit before mainnet

## Distributing updates

With Pear 3, updates come through `pear-runtime`: the packaged app (electron-forge) checks its `pear://` link peer-to-peer for new versions and installs them. This is not set up yet. The steps are in the [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron) template: create a link with `pear touch`, add it to the `upgrade` field in `package.json`, package the app, publish the folder with `pear stage` and keep it available with `pear seed`. The UI already shows "A new version of Pomona is ready · Restart"; it will be wired up to the updater. Keep the release key safe: whoever holds it can push updates to everyone.

## Licence

MIT. The Inter typeface is licensed under the SIL Open Font License.
