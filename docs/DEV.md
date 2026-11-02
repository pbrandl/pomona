# Entwicklermodus ohne Pear

`npm run dev` startet Pomona komplett auf dem eigenen Rechner, ohne Pear und ohne Verbindung nach draußen. Das ist gedacht für Rechner, auf denen Pear nicht startet, zum Beispiel hinter einer Firmen-Firewall wie Zscaler, die Peer-to-Peer-Verkehr blockiert.

Es läuft **derselbe Code** wie in Pear. Nur der Startweg ist ein anderer:

| | Pear | Entwicklermodus |
|---|---|---|
| Kern (Wallet, Runde, Belege, Assistent) | `core/` in Bare | `core/` in Bare |
| Oberfläche | `index.html` und `ui/` im Pear-Fenster | `index.html` und `ui/` im Browser |
| Verbindung UI ↔ Kern | `pear-pipe` (`ui/pear.js`, `worker/index.js`) | HTTP auf 127.0.0.1 (`ui/dev.js`, `scripts/dev.js`, `worker/dev.js`) |
| Chain | Arbitrum Sepolia o. a. | lokale Hardhat-Chain mit Test-USDT |
| P2P | öffentliches Holepunch-DHT | lokales DHT auf 127.0.0.1 |
| Sprachmodell | Download peer-to-peer über QVAC | Datei aus `~/pomona-models` |

Was hier gebaut oder geändert wird, läuft danach unverändert mit `pear run`.

## Einrichten (einmalig)

Voraussetzungen: [Node.js](https://nodejs.org) 22 oder neuer und Git.

```bash
git clone https://github.com/pbrandl/pomona.git
cd pomona/contracts && npm install
cd ../app && npm install
```

Hinter Zscaler scheitert `npm install` manchmal an TLS-Fehlern (`SELF_SIGNED_CERT_IN_CHAIN`). Dann das Firmen-Root-Zertifikat als Datei exportieren (Schlüsselbundverwaltung → Zscaler Root CA → Exportieren als `.pem`) und npm bekannt machen:

```bash
npm config set cafile ~/zscaler-root.pem
```

## Starten

```bash
cd pomona/app
npm run dev
```

Nach etwa 20 Sekunden öffnen sich zwei Browser-Tabs:

- **Anna** (http://127.0.0.1:4180) und **Ben** (http://127.0.0.1:4181) sind zwei Personen mit eigener Wallet. So lässt sich eine Runde von beiden Seiten ausprobieren: Anna organisiert, Ben bietet.
- Test-USDT gibt es beim Aufladen über „5.000 Test-USDT holen“.
- **Ctrl+C** im Terminal beendet alles. Chain, Wallets und Runden sind dann gelöscht, es ist eine reine Testumgebung.

Optionen:

| | |
|---|---|
| `npm run dev -- --one` | nur ein Profil |
| `npm run dev -- --no-open` | keinen Browser öffnen, Links stehen im Terminal |
| `PORT=5000 npm run dev` | anderer erster Port |
| `POMONA_DEBUG=1 npm run dev` | Logs der Kerne im Terminal anzeigen |

Den Link nur mit dem Teil `#t=…` öffnen, so wie er im Terminal steht. Ohne dieses Token nimmt der Kern keine Befehle an.

## Sprachmodell für „Frag Pomona“

Vorschläge und einfache Fragen beantwortet der Assistent auch ohne Modell. Für freie Fragen braucht er ein lokales Sprachmodell. Hier wird es nicht peer-to-peer geladen, sondern einmal im Browser heruntergeladen. Das ist normales HTTPS und geht meist auch hinter Zscaler.

1. Modell **Kompakt** (1,1 GB) herunterladen:
   https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/d7f544eead698dbd1f15126ef60b45a1e1933222/Qwen3-1.7B-Q4_0.gguf
2. In den Ordner `pomona-models` im Benutzerordner legen:
   ```bash
   mkdir -p ~/pomona-models
   mv ~/Downloads/Qwen3-1.7B-Q4_0.gguf ~/pomona-models/
   ```
3. In Pomona „Frag Pomona“ öffnen und **Kompakt** einrichten.

Beim ersten Mal prüft Pomona die SHA-256-Prüfsumme der Datei gegen den QVAC-Katalog. Das dauert einige Sekunden. Ist die Datei beschädigt oder ein anderes Modell, lehnt Pomona sie ab. Danach läuft der Assistent offline.

Das Modell **Genauer** (`Qwen3-4B-Q4_K_M.gguf`, 2,5 GB) kommt im QVAC-Katalog nicht von Hugging Face. Eine Datei gleichen Namens von dort hat wahrscheinlich eine andere Prüfsumme und wird dann abgelehnt. Erstmal **Kompakt** nehmen.

Ein anderer Ordner geht mit `POMONA_MODELS=/pfad npm run dev`. Wer den Peer-to-Peer-Download von QVAC trotzdem versuchen will (z. B. ohne Firewall): `POMONA_MODELS_P2P=1 npm run dev`.

## Sicherheit

Der Kern hält die Wallet, deshalb ist der lokale Server abgesichert:

- Er lauscht nur auf `127.0.0.1` und ist im Netzwerk nicht erreichbar.
- Jeder Aufruf braucht ein zufälliges Token, das bei jedem Start neu erzeugt wird. Es steht nur im Link aus dem Terminal und wird danach aus der Adresszeile entfernt.
- Andere Webseiten im selben Browser können den Kern nicht ansprechen. Das Token fehlt ihnen, und ein eigener Header erzwingt eine CORS-Vorabprüfung, die der Server nie beantwortet.
- DNS-Rebinding: Anfragen mit fremdem `Host` werden abgelehnt.
- Ausgeliefert werden nur `index.html` und `ui/`, nie `core/` oder `worker/`. Dazu kommen dieselbe CSP wie in Pear und `frame-ancestors 'none'`.
- Die lokale Chain nutzt den öffentlichen Hardhat-Schlüssel und ist deshalb nur hier aktiv (`allowDev`).

## Ablauf intern

1. `scripts/dev.js` baut die Contracts, startet Hardhat, deployt Factory und Test-USDT und startet ein HyperDHT-Testnetz auf 127.0.0.1.
2. Pro Profil startet es `worker/dev.js` mit `bare` (aus `bare-runtime`). Der Worker erzeugt `Pomona` mit lokalem DHT, lokaler Chain und `modelsDir` und spricht das RPC-Protokoll aus [RPC.md](RPC.md) über stdin/stdout.
3. Pro Profil läuft ein HTTP-Server. `POST /rpc` reicht Aufrufe an den Worker weiter, `GET /events` liefert Events als Server-Sent Events, und `index.html` wird mit `ui/dev.js` statt `ui/pear.js` ausgeliefert.
