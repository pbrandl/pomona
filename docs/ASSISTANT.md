# "Ask Pomona" assistant

The assistant is a conversational layer on top of the app. It answers questions in plain words and prepares steps such as "Pledge 100 a month", "Show my receipt for instalment 2" or "Send invoice". **It never executes anything itself.** Every action opens an existing page of the app, and the user confirms there as usual.

![Command without a language model](mobile/assistant-command.png)

## Where the answers come from

| Order | Source | Needs model | File |
|---|---|---|---|
| 1 | **Suggestion** (button): checked text with the current numbers | no | `core/agent/knowledge.js` |
| 2 | **Command** (rules): "pledge 100", "top up", "receipt instalment 2", "send invoice", "withdraw" | no | `core/agent/intents.js` |
| 3 | **Language model** (QVAC) with tools for free-form questions | yes | `core/agent/agent.js`, `tools.js`, `qvac.js` |
| – | Without a model: keyword search in the knowledge base, otherwise an offer to set one up | no | `knowledge.js` |

This way the assistant works immediately and on weak devices. The language model only comes in for free-form questions.

## What the model may do

The tools (`core/agent/tools.js`) only read or prepare:

| Tool | Effect |
|---|---|
| `calculate_bid(amount)` | calculates via `quoteBid`: deposit, fee, whether the balance is sufficient (read only) |
| `prepare_bid(amount)` | suggestion "Review pledge", opens the review page |
| `open_page(page)` | top-up, account, verify receipt, join, start round |
| `show_receipt(installment)` | receipt of a paid instalment |
| `prepare_invoice()` | organiser only, only when due |
| `prepare_withdraw()` / `prepare_refund()` | only when possible |
| `draft_news(text)` | organiser only; fills the field, does not send |

Every suggestion is checked against role, phase and status (`core/agent/actions.js`). Unknown tools are rejected.

## What the model sees

`core/agent/context.js` builds the system prompt:
- **Rules:** never claim anything that has not happened, never ask for the password or seed phrase.
- **Background knowledge** about Pomona.
- **Current situation** as facts from contract and wallet.

Texts from other peers (title, news) are sanitised and fenced in as **data**. The model is told to ignore any instructions in them. Even if it does not, it can only produce a suggestion that the user sees on the review page.

## Models (QVAC registry)

| Choice | QVAC constant | Size |
|---|---|---|
| Compact | `QWEN3_1_7B_INST_Q4` | 1.1 GB |
| More accurate | `QWEN3_4B_INST_Q4_K_M` | 2.5 GB |

- **Download:** once, peer-to-peer from the QVAC registry, into the worker's storage folder (`models/`). QVAC checks the SHA-256 checksum.
- **Afterwards** everything runs offline in the Bare worker (`@qvac/inference`, llama.cpp). The conversation never leaves the device, is not stored and is deleted when the app locks.
- **Without peer-to-peer** (corporate network, developer mode): the model file can also be downloaded by hand and placed in `modelsDir` (`~/pomona-models` in `npm run dev`). Pomona only uses it if size and SHA-256 match the QVAC catalogue, and then loads it directly with `modelType: llamacpp-completion`. See [DEV.md](DEV.md).
- **Other models:** any QVAC constant can be added to `MODELS` in `core/agent/qvac.js`, e.g. Qwen 3.5.

## Extending

- **New question:** add an entry to `TOPICS` (`knowledge.js`) with question, keywords and answer function, and optionally include it in `suggestions()`.
- **New command:** a pattern in `matchIntent` (`intents.js`).
- **New tool:** definition in `TOOLS` and mapping in `TO_ACTION` (`tools.js`), check in `validateAction` (`actions.js`), implementation in the UI (`agent-act` in `ui/app.js`). A tool that moves money does **not** belong here.

## Tests

- `test/assistant.test.js`: commands, knowledge, checks on every action, shielding of foreign texts, a prompt injection scenario, no money tools, installation, forgetting. The model here is a scriptable fake.
- `test/flow.test.js` ("assistant on a real round"): real chain, real `quoteBid`, fake model. Afterwards it is verified that no money has moved.
- `test/bare.test.js`: QVAC loads in Bare (configuration, llama.cpp plugin, model catalogue), and the assistant answers there.

## Still open

- **No real model tested yet:** in the development environment the network blocks the P2P download of the models. The registry found the model, but the download did not arrive. Answer quality in German, speed and the reliability of tool calls still have to be checked on a real machine.
- **Size of the native add-ons:** the QVAC add-on for one's own platform is large (Linux about 350 MB, Windows about 260 MB, macOS about 17 MB). For distribution via Pear it should later be loaded as an optional download instead of being part of the app package. In addition, a Pear release only contains the binaries of the platform it was built on. This has to be taken into account when staging.
- **Package versions:** `@qvac/inference` 0.22 expects `@qvac/llm-llamacpp` ^0.61 and `@qvac/langdetect-text` (loaded on import). The versions are pinned in the lockfile.
