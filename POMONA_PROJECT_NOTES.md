# Pomona — project notes

Goal: a decentralised funding round (Pear, WDK, QVAC), paid in stablecoins only; pledges per week/month, invoices, receipts.
Systems: repo pbrandl/pomona (`main`). Locally: `cd app && npm start` (starts chain + contracts, opens Electron). Browser without Pear: `npm run dev`. Preview: `npm run preview`; artifact preview https://claude.ai/artifact/FhvanqfmnG655DGYAvTLjg (a copy of the UI in the scratchpad; keep it in sync when the UI changes). User: Mac behind Zscaler (P2P/UDP often blocked), Node 25.

## NEXT
- User tests on the Mac: set up the model via "Choose existing file" (`Qwen3-1.7B-Q4_0.gguf`), Back on the start page, desktop start page (field focused, text slides up). Act on the feedback.
- Then: packaging (electron-forge) and P2P updates with `pear touch`/`pear stage` (template hello-pear-electron).

## Open
- Inference via a peer (QVAC RPC provider) as an explicit option? Privacy/Zscaler, see the answer from 2026-11-03.
- Sepolia/Arbitrum: configure bundler + paymaster, deploy the contracts.
- Concept `docs/CONCEPT.md` (round types, wallet service, swap, EURC/USDT/BTC): open questions there, not to be implemented yet.

## Decisions
- 2026-11-03 Pear 3: the app is Electron + `pear-runtime` (`pear run` no longer exists) — required by Pear.
- 2026-11-03 `npm start` starts the chain on 8545 and deploys by itself; a second instance `npm run start:second` uses the same chain.
- 2026-11-03 Organiser: the project page always shows the whole round; the organiser's own pledge lives on a separate pledge page. The organiser's own invoice is only recorded in the contract, nothing is transferred.
- 2026-11-03 Anyone with a wallet can pledge. Round description removed. Subtitle "Common Financing". Only "Back" as the way back, in the header.
- 2026-11-03 Desktop start: question field below the start text, focused; the chat opens with the first question. Phone: opens on tap.
- 2026-11-03 Model: local by default; file/folder can be chosen (SHA-256 check).
- 2026-11-03 Long checks only when needed / when versioning.
- 2026-11-07 README and `docs/` in English (`README.de.md` stays as the German version); the UI keeps de, en and es.
- 2026-11-08 No browser tests: `npm run ui-check` and Playwright removed; a new design gets new assets anyway.

## Ruled out
- `pear run` / `pear-electron` / `pear-pipe`: removed in Pear 3.
- QVAC P2P download behind Zscaler: REQUEST_TIMEOUT, stays at 0 %.
- `bare-sidecar` `end()` does not stop the worker; SIGTERM + `graceful-goodbye` instead.

## What happened
- 2026-11-03 Redundancy clean-up (styles.css 1181→700 lines, dead UI branches, timeline listener bug), `npm run ui-check` introduced.
- 2026-11-03 Organiser pledge page, `myInvoices` in the status, contract fix for the organiser's own payment.
- 2026-11-03 Switch to Pear 3 (Electron), `npm start` with chain, desktop start page, model file selection.
- 2026-11-07 README and docs translated to English, GitHub Actions CI (contracts, lint, app tests) with badge, test counts corrected (20 + 47).
- 2026-11-08 New screenshots of the current design (one image with four phone screens); model size and receipt title follow the UI language; `ui-check` and Playwright removed.
- 2026-11-08 Flaky CI fixed: ethers' log polling has no error handling, so a reset socket during `eth_getLogs` became an unhandled rejection. `RetryingProvider` (`core/chain/provider.js`) retries reads up to twice, never `eth_sendRawTransaction`; covered by a unit test (48 app tests).

## Files
- `docs/CONCEPT.md` — concept (not implemented)
- `app/electron/main.cjs`, `app/electron/preload.cjs`, `app/ui/electron.js`, `app/worker/index.js` — desktop shell
- `app/scripts/start.js` — `npm start`
- `.github/workflows/test.yml` — CI
