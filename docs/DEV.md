# Developer mode without Pear

`npm run dev` runs Pomona entirely on your own machine, without Pear and without any outside connection. It is meant for machines on which Pear does not start, for example behind a corporate firewall such as Zscaler that blocks peer-to-peer traffic.

It runs **the same code** as in Pear. Only the way it starts is different:

| | Pear | Developer mode |
|---|---|---|
| Core (wallet, round, receipts, assistant) | `core/` in Bare | `core/` in Bare |
| UI | `index.html` and `ui/` in the Pear window | `index.html` and `ui/` in the browser |
| UI ↔ core connection | Electron IPC and `Bare.IPC` (`ui/electron.js`, `electron/`, `worker/index.js`) | HTTP on 127.0.0.1 (`ui/dev.js`, `scripts/dev.js`, `worker/dev.js`) |
| Chain | Arbitrum Sepolia or similar | local Hardhat chain with test USDT |
| P2P | public Holepunch DHT | local DHT on 127.0.0.1 |
| Language model | peer-to-peer download via QVAC | file from `~/pomona-models` |

Whatever is built or changed here then runs unchanged in the desktop app (`npm start`).

## Setup (once)

Requirements: [Node.js](https://nodejs.org) 22 or newer and Git.

```bash
git clone https://github.com/pbrandl/pomona.git
cd pomona/contracts && npm install
cd ../app && npm install
```

Behind Zscaler, `npm install` sometimes fails with TLS errors (`SELF_SIGNED_CERT_IN_CHAIN`). In that case export the corporate root certificate as a file (Keychain Access → Zscaler Root CA → export as `.pem`) and tell npm about it:

```bash
npm config set cafile ~/zscaler-root.pem
```

## Start

```bash
cd pomona/app
npm run dev
```

After about 20 seconds, two browser tabs open:

- **Anna** (http://127.0.0.1:4180) and **Ben** (http://127.0.0.1:4181) are two people with their own wallets. This lets you try a round from both sides: Anna organises, Ben pledges.
- Test USDT is available on the top-up page via the faucet button (5,000 test USDT).
- **Ctrl+C** in the terminal stops everything. Chain, wallets and rounds are then deleted; it is a pure test environment.

Options:

| | |
|---|---|
| `npm run dev -- --one` | one profile only |
| `npm run dev -- --no-open` | do not open a browser; the links are printed in the terminal |
| `PORT=5000 npm run dev` | different first port |
| `POMONA_DEBUG=1 npm run dev` | show the cores' logs in the terminal |

Only open the link with the `#t=…` part, exactly as printed in the terminal. Without this token the core accepts no commands.

## Language model for "Ask Pomona"

The assistant answers suggestions and simple questions even without a model. For free-form questions it needs a local language model. Here it is not loaded peer-to-peer but downloaded once in the browser. That is normal HTTPS and usually works behind Zscaler too.

1. Download the **Compact** model (1.1 GB):
   https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/d7f544eead698dbd1f15126ef60b45a1e1933222/Qwen3-1.7B-Q4_0.gguf
2. Put it in the `pomona-models` folder in your home directory:
   ```bash
   mkdir -p ~/pomona-models
   mv ~/Downloads/Qwen3-1.7B-Q4_0.gguf ~/pomona-models/
   ```
3. In Pomona, open "Ask Pomona" and tap **Set up**.

Pomona also shows these three steps itself in "Ask Pomona", with the download link and the folder path to copy.

The first time, Pomona checks the file's SHA-256 checksum against the QVAC catalogue. This takes a few seconds. If the file is damaged or a different model, Pomona rejects it. After that the assistant runs offline.

The **More accurate** model (`Qwen3-4B-Q4_K_M.gguf`, 2.5 GB) does not come from Hugging Face in the QVAC catalogue. A file of the same name from there probably has a different checksum and is then rejected. Start with **Compact**.

A different folder works with `POMONA_MODELS=/path npm run dev`. To try QVAC's peer-to-peer download anyway (e.g. without a firewall): `POMONA_MODELS_P2P=1 npm run dev`.

## Checking the UI (`npm run ui-check`)

For changes to the UI, especially clean-ups and refactors without a visible change. The script goes through every view in the preview (mock): all scenarios, every page that can be opened from there, pledging and paying through to "Done", and the chat. It does this on four screens (iPhone 13, iPhone SE, dark, desktop). For every element it records position, size, text and computed style.

```bash
npm run ui-check                    # compares with the baseline (creates it the first time)
npm run ui-check -- --baseline      # record a new baseline, e.g. after an intended change
npm run ui-check -- --only phone    # one screen only: phone, small, dark or desk
```

Workflow: record the baseline before the refactor, then run `npm run ui-check`. The report separates "Moved or resized" and "Text", i.e. visible changes, from "Computed styles only". The latter are usually values without visible effect, such as `gap` on an element without gaps. Without differences the script exits with 0, otherwise with 1. Results are stored in `app/.ui-check/` (not in the repo). A run takes a little over four minutes.

Playwright needs Chromium once: `npx playwright install chromium`. Behind a proxy such as Zscaler the download can fail. In that case point `PLAYWRIGHT_BROWSERS_PATH` to an existing Chromium folder.

Not covered: hover, the phone keyboard and real devices. That remains manual work.

## Security

The core holds the wallet, so the local server is locked down:

- It only listens on `127.0.0.1` and is not reachable from the network.
- Every call needs a random token that is generated anew on every start. It is only contained in the link from the terminal and is then removed from the address bar.
- Other websites in the same browser cannot reach the core. They lack the token, and a custom header forces a CORS preflight that the server never answers.
- DNS rebinding: requests with a foreign `Host` are rejected.
- Only `index.html` and `ui/` are served, never `core/` or `worker/`. In addition, the same CSP as in Pear and `frame-ancestors 'none'`.
- The local chain uses the public Hardhat key and is therefore only active here (`allowDev`).

## How it works internally

1. `scripts/dev.js` builds the contracts, starts Hardhat, deploys factory and test USDT and starts a HyperDHT testnet on 127.0.0.1.
2. For each profile it starts `worker/dev.js` with `bare` (from `bare-runtime`). The worker creates `Pomona` with the local DHT, local chain and `modelsDir`, and speaks the RPC protocol from [RPC.md](RPC.md) over stdin/stdout.
3. One HTTP server runs per profile. `POST /rpc` passes calls to the worker, `GET /events` delivers events as server-sent events, and `index.html` is served with `ui/dev.js` instead of `ui/electron.js`.
