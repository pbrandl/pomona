# Pomona — Projektnotizen

Ziel: Dezentrale Bietrunde (Pear, WDK, QVAC), Zahlung nur in Stablecoins; Gebote pro Woche/Monat, Rechnungen, Belege.
Systeme: Repo pbrandl/pomona (`main`). Lokal: `cd app && npm start` (startet Chain + Contracts, öffnet Electron). Browser ohne Pear: `npm run dev`. Vorschau: `npm run preview`; Artifact-Vorschau https://claude.ai/artifact/FhvanqfmnG655DGYAvTLjg (Kopie der UI im Scratchpad, bei UI-Änderungen mitpflegen). Nutzer: Mac hinter Zscaler (P2P/UDP oft blockiert), Node 25.

## NEXT
- Nutzer testet am Mac: Modell über „Vorhandene Datei wählen“ (`Qwen3-1.7B-Q4_0.gguf`) einrichten, Zurück auf der Startseite, Startseite Desktop (Feld fokussiert, Text fliegt hoch). Rückmeldungen umsetzen.
- Danach: Paketieren (electron-forge) und P2P-Updates mit `pear touch`/`pear stage` (Vorlage hello-pear-electron).

## Open
- Inferenz über einen Peer (QVAC RPC-Provider) als ausdrückliche Option? Datenschutz/Zscaler, siehe Antwort vom 2026-11-03.
- Sepolia/Arbitrum: Bundler + Paymaster eintragen, Contracts deployen.
- Konzept `docs/CONCEPT.md` (Rundentypen, Wallet-Dienst, Swap, EURC/USDT/BTC): offene Fragen dort, noch nicht umsetzen.

## Decisions
- 2026-11-03 Pear 3: App ist Electron + `pear-runtime` (`pear run` gibt es nicht mehr) — Vorgabe von Pear.
- 2026-11-03 `npm start` startet Chain auf 8545 und deployt selbst; zweite Instanz `npm run start:second` nutzt dieselbe Chain.
- 2026-11-03 Organisator: Projektseite zeigt immer die ganze Runde; eigenes Gebot auf eigener Bietseite. Eigene Rechnung wird im Contract nur vermerkt, nichts überwiesen.
- 2026-11-03 Jeder mit Wallet kann bieten. Rundenbeschreibung entfernt. Untertitel „Common Financing“. Nur „Zurück“ als Rücklink, in der Kopfzeile.
- 2026-11-03 Desktop-Start: Fragefeld unter dem Starttext, fokussiert; Chat öffnet mit der ersten Frage. Handy: öffnet beim Antippen.
- 2026-11-03 Modell: lokal als Standard; Datei/Ordner wählbar (SHA-256-Prüfung).
- 2026-11-03 Lange Checks nur gezielt/beim Versionieren.

## Ruled out
- `pear run` / `pear-electron` / `pear-pipe`: in Pear 3 entfernt.
- QVAC-P2P-Download hinter Zscaler: REQUEST_TIMEOUT, bleibt bei 0 %.
- `bare-sidecar` `end()` beendet den Worker nicht; stattdessen SIGTERM + `graceful-goodbye`.

## What happened
- 2026-11-03 Redundanz-Aufräumen (styles.css 1181→700 Zeilen, tote UI-Zweige, Listener-Fehler Zeitleiste), `npm run ui-check` eingeführt.
- 2026-11-03 Organisator-Bietseite, `myInvoices` im Status, Contract-Fix Eigenzahlung.
- 2026-11-03 Umstieg auf Pear 3 (Electron), `npm start` mit Chain, Startseite Desktop, Modell-Dateiwahl.

## Files
- `docs/CONCEPT.md` — Konzept (nicht umgesetzt)
- `app/electron/main.cjs`, `app/electron/preload.cjs`, `app/ui/electron.js`, `app/worker/index.js` — Desktop-Hülle
- `app/scripts/start.js` — `npm start`; `app/scripts/ui-check.js` — UI-Prüfnetz
