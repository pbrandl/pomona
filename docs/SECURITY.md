# Security

Status: version 0.2. This document contains the threat model, the results of the review of version 0.1 and the risks that deliberately remain open. The review does **not** replace an external audit.

## What is protected

| Asset | Where it lives |
|---|---|
| Backers' USDT in escrow | `PomonaRound` |
| Seed phrase / wallet | encrypted in the worker's local Hyperbee |
| USDT in the wallet | smart account (Safe) on the chain |
| Authenticity of the round (who, for what, how much) | contract + manifest |

**Attackers considered:**
- a stranger with a manipulated invitation link
- a malicious peer in the Hyperswarm
- a backer who wants to get back too much
- an organiser who wants to collect more or earlier
- someone with access to the disk
- malicious code in the UI, e.g. via injected HTML

## Review of version 0.1 and what changed in 0.2

| # | Finding in 0.1 | Severity | Status in 0.2 |
|---|---|---|---|
| 1 | **Forged round via link.** The link contained an arbitrary contract address. The app would have signed `approve` for it, and a copycat contract could have drained the money. | High | **Fixed.** `PomonaFactory.isRound` is a registry. The app aborts if the round does not come from the configured factory or does not run in USDT. Tested in `flow.test.js` ("forged rounds"). |
| 2 | **Seed in plain text** on disk. | High | **Fixed.** Argon2id (libsodium `crypto_pwhash`) and XSalsa20-Poly1305 (`crypto_secretbox`). The wallet is locked after start. Showing the seed and outgoing transfers require the password again. |
| 3 | **Unlimited wallet permissions.** Any bug in core or UI could have signed arbitrary transactions. | Medium | **Fixed.** A WDK policy (default deny) only allows: calls to the user's own round, `createRound` on the factory, `approve` of USDT exclusively to the user's own round, `transfer` only in USDT. Native value is never allowed. Tested in `unit.test.js` and `flow.test.js`. |
| 4 | **Unchecked data from peers** (title, website, news): arbitrarily large, arbitrary types. | Medium | **Fixed.** Schema check and length limits (`p2p/manifest.js`, `config/limits.js`). The data is only displayed escaped, and amounts and the organiser always come from the contract. |
| 5 | **No CSP** in the renderer. | Medium | **Fixed.** CSP with `script-src 'self'`, no remote code, `object-src 'none'`. Everything that ends up in HTML goes through `esc()`. |
| 6 | **RPC without parameter checks.** | Low | **Fixed.** Whitelist with schema (`rpc/methods.js`), `Object.hasOwn` instead of prototype lookup, size limit per message. |
| 7 | **Faucet with the public Hardhat key** would have been available in every build. | Low | **Fixed.** The local chain is only reachable in developer mode (`--dev`). |
| 8 | **Fee token (ETH) required.** | – | **Fixed.** With ERC-4337 and a USDT paymaster there is a fee cap of 5 USDT per transaction (`transactionMaxFee`). |
| 9 | Money could get stuck in the contract if the organiser disappears. | Medium | **Fixed.** From `expiresAt` the round counts as completed, and backers get the rest back. |
| 10 | "Restore" could have overwritten an existing wallet. | Medium | **Fixed.** If a vault already exists, this is rejected. |

## Contract review (0.2)

- **Reentrancy:** all functions that move money are `nonReentrant`, and the state is set before the transfer.
- **Rounding and overflow:** there is no division. Multiplications are checked (Solidity ≥ 0.8). Exactly `amount × installments` or `total` per invoice is paid.
- **Fee-on-transfer:** detected and rejected (`UnsupportedToken`, tested with `FeeToken`).
- **Invitation:** the digest is bound to `chainid`, the contract address and `msg.sender`. A signature can be used neither for another address nor for another round or chain (tested). Intercepted signatures are worthless to third parties.
- **Time:** `block.timestamp` counts; deviations are in the range of seconds and irrelevant for intervals of a day or more.
- **USDT blacklist:** if the organiser is blacklisted, invoices fail. From `expiresAt` backers get the rest back. If a backer is blacklisted, it only affects them.
- **No admin functions, no upgrade, no `selfdestruct`.**

## Deliberately open risks

| Risk | Assessment and handling |
|---|---|
| **The contract has not been externally audited.** | An audit is mandatory before real money. |
| **WDK packages are in beta.** | Versions are pinned via the lockfiles. Check again before a release. |
| **Compromised UI (XSS):** it cannot read the seed and cannot transfer outward, because both require the password. With a new wallet, however, it could join a foreign real round and pledge. | Unlikely thanks to CSP and escaping. Only one round per instance. Optionally, pledges could also require the password in the future. |
| **Sybil:** the organiser can pledge with their own money (or via straw men) to make the target appear reached. | Cannot be prevented technically. Pledges are publicly visible on the chain. |
| **Invite key in the link:** whoever has the link can pledge. | This is intended (link = permission). The key protects against spam, not the money. Do not post the link publicly. |
| **Pledging in open rounds without a minimum pledge:** tiny amounts are possible. | Costs the spammer fees and does no other harm. Set a minimum pledge. |
| **Receipts can be passed on.** A receipt proves the payment of an address, not the identity of the person showing it. | Sufficient for proof of collection. For more, a challenge-response signature from the backer's wallet would be needed. |
| **Trust in the RPC provider:** a lying RPC could show false balances. It cannot sign and therefore cannot move money. | Use your own node or several providers (WDK supports failover via an array of providers). |
| **Paymaster and bundler:** the paymaster gets a USDT approval for the fees. | WDK checks the paymaster address against the configuration. Choose reputable providers and keep the fee cap active. |
| **IP addresses:** peers in the same Hyperswarm topic see each other's IP addresses. | That is how P2P works. Explain it in the app. |
| **Public chain:** pledges and amounts are public and pseudonymous. | Use a separate wallet per person. |
| **By invoice: no payment guarantee.** Pledges are commitments; nobody has to pay an invoice. | Intended, so that nobody has to pay in advance. The organiser sees per invoice who has not paid. Anyone who needs certainty chooses "deposit upfront". |
| **By invoice: Sybil at no cost.** Since pledging deposits nothing, commitments are easy to inflate so that the target appears reached. | Use the invitation link (default) and a minimum pledge. What counts is what gets paid: the instalment list shows the real incoming payments. |
| **By invoice: open invoices are public.** Anyone who knows the round can see on chain which address has not paid (`unpaid`). | Pseudonymous, not anonymous. The app only shows the list to the organiser; backers only see totals. |
| **Offline brute force on the vault:** with access to the disk, passwords can be guessed. | At least 8 characters, Argon2id with parameters for interactive use. For mainnet, raise the parameters (they are stored in the vault, so a migration is possible) and add an automatic lock on inactivity. |
| **Seed in memory** while the wallet is unlocked. | JavaScript strings cannot be reliably erased. `lock()` removes all references. |

## Review of version 0.4 (November 2026)

| # | Finding | Severity | Status |
|---|---|---|---|
| 11 | **Receipts could be forged.** A receipt only contained public data (network, round, address, instalment). Anyone reading the address of a paying member from the blockchain could create a valid receipt, e.g. for a pickup, without having paid themselves. | High | **Fixed.** Receipts (format v2) are signed with the key of the paying account (EIP-191). For the smart account, the verifier checks `isOwner` on the Safe on chain. They are only valid for 10 minutes, and the app renews the QR code as long as it is open. Manipulated, foreign-signed and old receipts are rejected (`flow.test.js`). The wallet policy only allows `sign` for receipt messages. |
| 12 | **Password guessing via the app** (e.g. with a compromised UI) was unlimited. | Medium | **Fixed.** After three failed attempts an exponentially growing lockout (5 s to 5 min) applies to unlocking, seed phrase and sending. |
| 13 | **Load on the RPC provider:** every status query read up to 520 invoice times. Public providers risked throttling. | Low | **Fixed.** The times never change and are cached. |
| 14 | Escaping in the UI: all values checked. Values from the contract (e.g. token symbol) also go through `esc()`. | – | No finding. |

Remaining: a receipt can be passed on within its 10 minutes (screenshot). For more, a challenge to the backer's device would be needed (challenge-response).

## "Ask Pomona" assistant (QVAC)

| Risk | Countermeasure |
|---|---|
| The language model moves money | There is no tool for it. The tools read (`calculate_bid`) or suggest an action. An action only opens a page of the app; signing happens there, by the user. The assistant has no access to wallet, password or seed phrase. |
| Prompt injection via title or news (they come from other peers) | The texts are sanitised (chat template tokens, tags and delimiters removed), truncated and fenced in as data. The system prompt forbids following instructions from them. Even if a model obeys, the result is at most a suggestion that the user sees on the review page. Tested in `test/assistant.test.js`. |
| Inappropriate suggestions (wrong role, phase, instalment) | Every action is checked against the current status (`core/agent/actions.js`). Pledges are calculated beforehand with `quoteBid` against the contract's rules. |
| Wrong answers (hallucination) | Suggestion buttons and commands run without a model on checked texts. Model answers are visibly labelled ("Local AI · may be wrong"). Numbers come from the status, not from the model. |
| Privacy | The model runs locally (QVAC, llama.cpp). Questions never leave the device. The conversation is not stored and is deleted on lock. |
| Manipulated model | QVAC checks downloaded models against the SHA-256 checksum from its catalogue. The catalogue ships with the npm package, whose version is pinned via the lockfile. |
| Model file by hand (developer mode, `modelsDir`) | Pomona only uses a self-downloaded file if size and SHA-256 match the QVAC catalogue (`core/agent/qvac.js`). The result is remembered together with size and modification time; a replaced file is checked again. |
| Download | The model is loaded peer-to-peer from the QVAC registry. As with Hyperswarm, IP addresses are visible to the other side. |

## Desktop app (Electron + pear-runtime)

- **Sandboxed renderer:** `sandbox`, `contextIsolation`, no Node (`nodeIntegration: false`), the same CSP as before (no foreign code, no inline scripts).
- **One door:** the renderer reaches the main process only via `window.bridge` from `electron/preload.cjs`. The main process only accepts IPC from its own page (`index.html`) and only starts the one worker, never a path from the renderer.
- **No navigation:** the window cannot leave its own page. Web links (a project's website, from the sanitised manifest, http/https only) open in the default browser.
- **Permissions:** only the camera (scanning QR codes); everything else is denied. macOS asks once.
- **Keys only in the worker:** the main process passes RPC lines through and holds no secrets.

## Developer mode without Pear (`npm run dev`)

In the browser, a local HTTP server sits between UI and core instead of Electron IPC. It only listens on 127.0.0.1. Every call needs a token that is randomly generated on every start and checked with `timingSafeEqual`. A custom header forces a CORS preflight for foreign pages that is never answered. Foreign `Host` headers (DNS rebinding) are rejected. Only `index.html` and `ui/` are served. The same CSP as in Pear applies, plus `frame-ancestors 'none'`. This mode always uses the local chain with test money. Details in [DEV.md](DEV.md).

## "By invoice" mode (`pay`)

- `pay(i)` uses `transferFrom` to move exactly the backer's own pledge directly from the backer to the organiser. The contract holds no money in the process, but checks that exactly this amount arrives at the organiser (fee tokens are rejected).
- Paying twice is impossible (`AlreadyPaid`), as is paying invoices that have not been issued (`NotIssued`) or paying as an outsider (`NotBidder`).
- The approval (`approve`) only covers the amount of the invoices to be paid and only the user's own round. It goes out in the same signature as the payment. The WDK policy still only allows approvals to the user's own round.
- Before every payment the app shows amount, recipient, fee and balance. If the balance is insufficient (including the fee in USDT), it offers a top-up instead of a payment that would fail.
- The assistant can only open the payment page. The user has to pay themselves.

## Before any mainnet use

1. External audit of `PomonaRound` and `PomonaFactory`.
2. Configure bundler and paymaster (USDT) from a reputable provider and test on Sepolia.
3. Raise the Argon2id parameters and add an automatic lock on inactivity.
4. Add several RPC providers as failover.
5. Keep the Pear release key safe (it signs the app updates).
6. Check dependencies (`npm audit`) and re-evaluate the versions of the WDK packages.

## Reporting

Please do not report security vulnerabilities publicly as an issue, but directly to the maintainer.
