# Architektur

Pomona besteht aus drei Teilen, die sich klar voneinander trennen lassen:

```
┌──────────────── Desktop-App (Electron + pear-runtime) ────────────────────┐
│                                                                           │
│  UI (Electron-Renderer)          Worker (Bare)                            │
│  app/ui/*                        app/worker/index.js → app/core/*         │
│  ┌────────────────────┐  RPC    ┌──────────────────────────────────────┐  │
│  │ views/*  (HTML)    │ ──────▶ │ rpc/      Whitelist + Validierung    │  │
│  │ app.js   (State,   │ ◀────── │ pomona.js Anwendungsdienst           │  │
│  │          Actions)  │ events  │   ├─ wallet/  WDK-Accounts, Tresor,  │  │
│  └────────────────────┘         │   │           Policy                  │  │
│  Preload ↔ Main ↔ Bare.IPC      │   ├─ chain/   Contracts lesen,       │  │
│                                 │   │           Calls kodieren          │  │
│                                 │   ├─ p2p/     Hyperswarm, Manifest   │  │
│                                 │   └─ links, schedule, units, config  │  │
│                                 └──────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
          │ Hyperswarm (P2P)                         │ JSON-RPC / Bundler
          ▼                                          ▼
   andere Teilnehmer                       EVM-Chain: PomonaFactory,
   (Manifest, Neuigkeiten)                 PomonaRound, USDT, Paymaster
```

## Grundsätze

1. **Die Chain ist die Wahrheit über Geld.** Beträge, Phasen, Zeitplan, Organisator und Belege kommen immer aus dem Contract. Daten aus dem P2P-Netz (Titel, Website, Neuigkeiten) sind nur Beiwerk. Die App prüft sie gegen den Contract und kürzt sie auf feste Größen.
2. **Nur USDT.** Nutzer halten keinen anderen Token. Auf echten Netzwerken ist die Wallet ein ERC-4337 Smart Account. Ein Token-Paymaster nimmt die Gebühr in USDT.
3. **Der Worker besitzt alle Geheimnisse.** Seed, Schlüssel und Netzwerkzugriff liegen im Bare-Worker. Die UI sieht nur JSON und kann nur die Methoden aus `core/rpc/methods.js` aufrufen.
4. **Eine Runde pro App-Instanz.** Das hält Zustand, UI und Sicherheitsmodell einfach.
5. **Läuft in Node und Bare.** Der Kern benutzt nur Pakete, die in beiden Runtimes funktionieren. `core/bare.js` mappt die Node-Builtins nach dem Muster der WDK-Pakete. Die Tests laufen in Node, ein Smoke-Test zusätzlich in Bare.

## Module

| Pfad | Aufgabe |
|---|---|
| `contracts/src/PomonaRound.sol` | Escrow und Raten-Abrechnung einer Runde, siehe [CONTRACT.md](CONTRACT.md) |
| `contracts/src/PomonaFactory.sol` | Legt Runden an und ist das Register `isRound` gegen gefälschte Contracts |
| `contracts/scripts/` | `build` (solc-js, erzeugt auch `app/core/chain/abi.js`), `devchain`, `deploy` |
| `app/electron/main.cjs` | Electron-Hauptprozess: Fenster, startet den Worker mit `pear-runtime`, reicht RPC zwischen UI und Worker durch (hält keine Schlüssel) |
| `app/electron/preload.cjs` | Einzige Tür zwischen abgeschottetem Renderer und Hauptprozess (`window.bridge`) |
| `app/worker/index.js` | Startet den Kern und bedient RPC über `Bare.IPC` |
| `app/core/pomona.js` | **Anwendungsdienst.** Alle Geschäftsregeln, Vorprüfungen, Status |
| `app/core/wallet/` | `account.js` (Interface), `smart-account.js` (ERC-4337), `dev-account.js` (lokal), `vault.js` (Argon2id + secretbox), `policy.js` (WDK-Policy) |
| `app/core/chain/` | `contracts.js` (lesen + Calls kodieren), `reverts.js` (Fehlertexte), `provider.js`, `abi.js` (generiert) |
| `app/core/p2p/` | `node.js` (Corestore, Hyperswarm, lokale Einstellungen), `manifest.js` (Schema und Bereinigung) |
| `app/core/links.js` | Einladungslinks `pomona://` und Belege `pomona-beleg://` |
| `app/core/schedule.js` | Zeitplan der Rechnungen, spiegelt die Regeln des Contracts |
| `app/core/units.js` | Beträge parsen (deutsch/englisch) und formatieren |
| `app/core/config/` | `networks.js` (Chains, Bundler, Paymaster), `deployments.js` (generiert), `limits.js` |
| `app/core/rpc/` | `server.js` (Protokoll), `methods.js` (Whitelist mit Parameter-Schema) |
| `app/ui/` | `app.js` (State, Actions, Events), `views/*` (reine Render-Funktionen), `format.js`, `pear.js` (Bridge), `mock.js` (Vorschau) |

## Abläufe

**Runde starten (Organisator)**
1. `createRound` prüft die Eingaben und dass das Netzwerk eingerichtet ist.
2. Die Wallet führt `factory.createRound(...)` aus. Die neue Adresse wird über `factory.roundsOf(organizer)` gelesen.
3. Das Manifest wird in einen eigenen Hyperbee geschrieben und auf Hyperswarm angekündigt.
4. Der Einladungslink enthält den Manifest-Key, das Netzwerk, die Round-Adresse und optional den Invite-Key.

**Beitreten (Bieter)**
1. Link dekodieren. Das Netzwerk muss bekannt und eingerichtet sein.
2. `factory.isRound(round)` muss `true` sein, und der Token muss USDT sein. Sonst wird abgebrochen (Schutz vor gefälschten Contracts).
3. Der Invite-Key muss zum `inviteSigner` des Contracts passen.
4. Das Manifest wird über Hyperswarm geladen, von jedem Peer, der es hat, und dann komplett mitgeseedet.
5. Manifest und Link müssen dieselbe Round und Chain nennen. Der Status zeigt `verified`, wenn auch der Organisator übereinstimmt.

**Bieten**
1. Vorprüfungen: Phase, Mindestgebot und ein Guthaben von mindestens `Betrag × Raten`.
2. Die Invite-Signatur wird lokal mit dem Invite-Key erzeugt, gebunden an Chain, Round und Bieter-Adresse.
3. Die Calls `[approve(round, Betrag×Raten), bid(Betrag, Signatur)]` gehen auf dem Smart Account als **eine** User-Operation raus, die Gebühr wird in USDT bezahlt.

**Rechnung stellen (Organisator)**
- `invoice()` ist ab `biddingEnd + i × interval` möglich, höchstens `installments`-mal und nur bis `expiresAt`. Jede Rechnung zahlt `total` (Summe aller Gebote pro Rate) an den Organisator.

**Belege**
- `receipt(index)` erzeugt `pomona-beleg://{netz, round, bieter, index}` als QR.
- `verifyReceipt` prüft den Beleg am Contract: `isRound` und `receipt(bieter, index)`. Das geht ohne Wallet und ohne den Organisator.

## Status und Events

Die UI hält keinen eigenen Geschäftszustand. Bei jedem `change`-Event des Workers ruft sie `status()` auf und rendert neu. Auslöser für `change` sind eigene Aktionen, neue Manifest-Daten und ein Poll-Timer (8 s, lokal 1,5 s). Wie `status()` aussieht, steht in [RPC.md](RPC.md).

## Erweitern

| Vorhaben | Wo ansetzen |
|---|---|
| **Neues EVM-Netzwerk** | Eintrag in `core/config/networks.js`, Factory deployen (`contracts/scripts/deploy.js`) und Bundler und Paymaster in `aa` eintragen. |
| **Andere Chain (TON, Tron, Solana)** | Neue Account-Klasse nach dem Interface in `core/wallet/account.js` mit dem passenden WDK-Modul, Contract-Gegenstück, `chain/`-Adapter. `pomona.js` spricht nur mit diesen Schnittstellen. |
| **Monatsrechnungen über Lightning** | Neuer Zahlungsweg neben `invoice()`: WDK `wdk-wallet-spark` im Worker. Die Rechnung geht über das Manifest (`news/` analog zu `invoices/`), das Preimage dient als Beleg in `links.js`. |
| **Telegram** | Ein zweiter Adapter neben `rpc/server.js`: Der Bot läuft im Worker des Organisators und ruft dieselben Methoden aus `rpc/methods.js` auf. |
| **Mobile** | Der Kern läuft in Bare und damit auch in Bare Kit (iOS/Android). Nur `ui/` muss neu gebaut werden, das RPC bleibt gleich. |
| **Neue UI-Funktion** | View-Funktion in `ui/views/`, Button mit `data-action`, Eintrag in `actions` in `ui/app.js`, Methode in `core/rpc/methods.js` und `core/pomona.js`. |
| **Sprache** | Texte stehen in `ui/views/*`, `core/chain/reverts.js` und den `fail(...)`-Aufrufen. Für i18n die Codes (`PomonaError.code`) als Schlüssel nutzen. |

## Konventionen

- ES-Module, JavaScript mit JSDoc-Typen, Stil `standard` (`npm run lint`).
- Fehler, die der Nutzer sieht, sind `PomonaError` mit stabilem Code; `fail(code, key, params)` holt den Text `err.<key>` in der eingestellten Sprache.
- Beträge sind im Kern immer `bigint` in Basiseinheiten. Strings gibt es nur an der RPC-Grenze.
- Jede Geschäftsregel steht genau einmal im Contract. `schedule.js` spiegelt sie nur für die Anzeige.
- Tests: `contracts/test` (Contract), `app/test/unit.test.js` (ohne Netz), `app/test/flow.test.js` (End-to-End), `app/test/bare.test.js` (Bare).

## Pear 3: Electron mit pear-runtime

Seit Pear 3 startet Pear keine Apps mehr (`pear run` entfällt). Eine Pear-App ist eine normale Electron-App, die `pear-runtime` einbindet: Bare-Worker, Speicher und P2P-Updates. Pomona folgt der Vorlage [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron):

- **Hauptprozess** (`electron/main.cjs`): öffnet das Fenster, startet `worker/index.js` mit `PearRuntime.run()` (die Bare-Laufzeit bringt `bare-sidecar` für jede Plattform mit) und reicht die RPC-Zeilen durch. Er hält keine Schlüssel und kennt keine Geschäftsregeln.
- **Preload** (`electron/preload.cjs`): stellt `window.bridge` bereit (Worker starten, Zeilen schreiben und empfangen, Kopieren, Kamera, Neustart). Der Renderer läuft mit `sandbox`, `contextIsolation` und ohne Node.
- **Renderer**: `index.html` mit `ui/electron.js`, das daraus `window.pomona` macht.
- **Worker** (`worker/index.js`): Kern und RPC über `Bare.IPC`. Beim Beenden schickt der Hauptprozess SIGTERM; `graceful-goodbye` schließt Swarm und Speicher sauber.
- **Start** (`scripts/start.js`, `npm start`): startet bei Bedarf die lokale Chain auf 127.0.0.1:8545, deployt die Contracts (oder nimmt vorhandene) und öffnet Electron mit `--dev --local <Adressen>`.
- **Speicher**: `<userData>/dev` mit `--dev` (lokale Chain), sonst `<userData>/storage`. `--storage <dir>` setzt einen eigenen Ordner und erlaubt damit eine zweite Instanz.
- **Updates**: noch nicht eingerichtet; kommen mit dem Paketieren (siehe README).

## Zwei Startwege, ein Code

Kern (`core/`) und Oberfläche (`ui/`, `index.html`) kennen Pear nicht direkt. Sie sprechen nur über `window.pomona` (`call`, `on`, `copy`, `cameraAccess`, `restart`) bzw. über das RPC-Protokoll miteinander. Diese Hülle gibt es zweimal:

| | Oberfläche | Kern |
|---|---|---|
| Desktop (`npm start`) | `ui/electron.js` über `electron/preload.cjs` und `electron/main.cjs` | `worker/index.js` (über `pear-runtime`) |
| Entwicklermodus (`npm run dev`) | `ui/dev.js` (HTTP, Server-Sent Events) | `worker/dev.js` (stdin/stdout), gestartet von `scripts/dev.js` |
| Design-Vorschau (`npm run preview`) | `ui/mock.js` (simuliert) | – |

Neue Funktionen kommen also in `core/` und `ui/` und laufen auf allen Wegen. Siehe [DEV.md](DEV.md).

## Live-Updates

`RoundContract.watch()` abonniert alle Events der Runde (Bid, Invoiced, …) per `eth_getLogs`-Polling im Takt `pollMs` des Netzwerks (Arbitrum 1 s, Ethereum 4 s, lokal 0,1 s). Jedes Event löst `change` aus; die UI lädt den Status neu. Ein 15-s-Timer hält Countdowns aktuell. Auf Arbitrum sehen alle ein neues Gebot so etwa 1–3 s nach dem Absenden.

## Belege prüfen

Der Organisator öffnet „Beleg prüfen“: Kamera (getUserMedia + jsQR, `ui/scanner.js`, `ui/vendor/jsqr.js`) oder Code einfügen. Geprüft wird immer am Contract (`verifyReceipt`).

## Bedienung: Aufladen, Bieten, Status, Benachrichtigungen

- **Aufladen** (`ui/views/fund.js`): Adresse mit QR-Code, Warnungen (nur USDT, richtiges Netzwerk, nie an eine Runde senden). Der Kern beobachtet `Transfer`-Events an die eigene Adresse (`Pomona._watchFunds`, Event `funds`), damit ein Eingang in Sekunden angezeigt wird. Nach dem Erstellen einer leeren Wallet öffnet sich das Aufladen automatisch.
- **Bieten: Betrag → Prüfen → Fertig** (`ui/views/bid.js`): Der Schritt „Betrag“ füllt genau die Bildschirmhöhe: Fortschritt der Runde mit dem eigenen Gebot als Segment, die Zahl, eine Notiz, auf Touch-Geräten ein Ziffernblock, auf dem Desktop ein direkt fokussiertes Feld. Dann `quoteBid` (Hinterlegung bzw. Rechnungen, Gebühr, Guthaben), danach `bid`. Der Fortschritt kommt als `busyStep` (`prepare` → `sign` → `confirm`) aus `Account.execute(calls, { onStep })`.
- **Bezahlen** (`ui/views/pay.js`, Runden „Per Rechnung“): Prüfen → Fertig; ohne genug USDT erscheint „Konto aufladen“ statt eines Knopfs, der scheitern würde.
- **„Du“-Karte** (`ui/views/you.js`): Wo stehe ich, und was ist jetzt zu tun? In Phase 1 die Box „Dein Gebot“ mit einem Knopf, sonst ein Satz und genau eine Hauptaktion je Rolle und Phase („Rechnung 4 ist fällig – Rechnung stellen“, „900 USDT warten auf dich – Zurückholen“).
- **Rundenansicht** (`ui/views/round.js`): jede Information nur einmal. Phase und Frist über dem Titel, Titel einzeilig mit Website und Einladen (QR-Code, Link), Zusagen darunter; Ring mit Bietenden, Durchschnitt und Median; die Raten als Zeitleiste (oben erhalten, unten ausstehend, bezahlte abgehakt, antippen für Beleg oder Bezahlen); Neuigkeiten, die neueste offen; Organisator-Werkzeuge als Liste („Verwalten“).
- **Projektseite und Bietseite:** Bieten kann jeder mit Wallet, auch der Organisator. Seine Rundenansicht ist die Projektseite: Sie zeigt immer die ganze Runde (Summen, wer bezahlt hat, Verwalten). Sein eigenes Gebot liegt auf einer eigenen Bietseite (`ownPage`, erreichbar über „Verwalten“), die genau zeigt, was jeder Bietende sieht: „Dein Gebot“, die eigenen Raten, Belege und offene Rechnungen. Der Kern liefert dafür `invoices` (Plan der Rundenseite) und `myInvoices` (eigene Raten). Die eigene Rechnung des Organisators wird im Contract nur vermerkt, überwiesen wird nichts.
- **Benachrichtigungen** (`ui/notify.js`): `changes(prev, next)` vergleicht zwei Status-Schnappschüsse (Eingang, Ziel erreicht/verfehlt, neue Rate mit Beleg, Rechnung fällig, neues Gebot, Phase 1 endet in 24 h, Neuigkeit). Bei aktivem Fenster als Toast, sonst als System-Benachrichtigung. Eigene Aktionen lösen keine Meldung aus. Getestet in `test/notify.test.js`.

## Seiten statt Seitenleisten (one step, one page)

Jeder Ablauf ist eine Folge ganzer Seiten mit Schrittleiste oben (`page()` in `ui/views/parts.js`):

| Ablauf | Schritte |
|---|---|
| Konto anlegen | Passwort → Seedphrase → Aufladen |
| Finanzierungsrunde starten | Projekt → Phase 1 → Raten → Prüfen |
| Bieten | Betrag → Prüfen → Fertig |
| Einzelseiten | Beitreten, Aufladen, Konto, Beleg, Rechnung, Beleg prüfen |

Eine offene Seite ersetzt die Rundenansicht (`ui.sheet`). Ihr „← Zurück“ setzt `render()` oben in die Kopfzeile, an die Stelle des Labels „Pomona“ und auf eine Linie mit Chat und Guthaben. Der Hauptknopf bleibt auf dem Handy unten erreichbar (`.actions.sticky`). Bildschirmfotos in `docs/mobile/`.

## Oberfläche pflegen

- **Ein Weg für jede Seite:** `page()` in `ui/views/parts.js`; neue Seiten in `SHEETS` (`ui/app.js`) eintragen, Knöpfe bekommen ein `data-action`, die Aktion steht in `actions`.
- **Neuzeichnen:** `render()` baut das HTML neu und gleicht es mit Idiomorph ab. Unveränderte Knoten bleiben erhalten, so behält ein Feld den Fokus und die Handy-Tastatur bleibt offen. Folge: Listener an Elementen innerhalb von `#app` nur einmal binden (`once()` in `ui/app.js`), sonst häufen sie sich bei jedem Statusupdate.
- **Styles:** `ui/styles.css` ist nach Bereichen der Oberfläche gegliedert (Tokens, Basis, Kopfzeile und Seiten, Bedienelemente, Runde, Bieten, Bezahlen, Konto, Assistent, Startseite). Jeder Selektor steht einmal; Handy-Varianten im Block seines Abschnitts. Ändern statt anhängen.
- **Grenze Renderer/Kern:** Die Oberfläche lädt keinen Kern-Code (der Dev-Server liefert nur `ui/` und `i18n/` aus). Kleine Helfer wie das Lesen deutscher Beträge gibt es deshalb zweimal: `core/decimal.js` und `ui/format.js` `num()` (nur für Vorschauen).
- **Keine Texte im Code:** Alles, was Menschen lesen, kommt über `t('bereich.schlüssel')` aus `i18n/` (siehe „Sprachen“).

## Sprachen

Deutsch, Englisch und Spanisch. Die Texte stehen in `app/i18n/<sprache>/`, eine Datei pro Bereich: `core.js` (Fehler, Belegprüfung, Netzwerke, Datum), `agent.js` (Assistent: Antworten, Befehlsmuster, Prompt, Werkzeuge), `ui.js` (Oberfläche). Deutsch ist die Referenz und der Rückfall für fehlende Schlüssel.

- **Benutzen:** `t('wallet.title')`, mit Werten `t('bid.missing', { amount, symbol })`. Mehrzahl: `{ one, other }`, gewählt über `n`. Listen (Schritte, Monate, Stichwörter) mit `raw()`. Werte von außen (Titel, Adressen) escaped die Ansicht vor dem Einsetzen; die Katalogtexte selbst dürfen einfaches Markup (`<strong>`) enthalten.
- **Auswahl:** gespeicherte Wahl (`localStorage` `pomona.lang`), sonst die Systemsprache, sonst Deutsch. Umschalten auf der Kontoseite und beim ersten Start. Die Oberfläche meldet die Sprache per RPC `setLanguage` an den Worker; der schreibt Fehler und Assistenten-Antworten dann in derselben Sprache.
- **Zahlen** folgen der Sprache (`numbers` in `LANGUAGES`): Deutsch und Spanisch `1.234,5`, Englisch `1,234.5`. Anzeige (`fmt`, `num`) und Eingabe (`core/decimal.js`, `ui/format.js` `num()`, Befehle im Assistenten) lesen dieselbe Regel. Der Ziffernblock speichert intern immer einen Punkt und zeigt das Trennzeichen der Sprache. Datumsangaben folgen der Sprache.
- **Begriffe (Englisch / Spanisch):** Finanzierungsrunde = *funding round* / *ronda de financiación*, Gebot = *pledge* / *compromiso*, bieten = *pledge* / *comprometerse*, Phase 1 / Phase 2 = *Phase 1 / Phase 2* / *fase 1 / fase 2*, Rate = *installment* / *cuota*, Rechnung = *invoice* / *factura*, Beleg = *receipt* / *comprobante*, Treuhandkonto = *escrow* / *cuenta de garantía*, Richtwert = *suggested amount* / *importe orientativo*, Seedphrase = *seed phrase* / *frase semilla*. Spanisch mit *tú*, ohne Landesvarianten.
- **Neue Sprache:** `i18n/de/` nach `i18n/xx/` kopieren, Werte übersetzen (Schlüssel und `{platzhalter}` bleiben), in `i18n/index.js` unter `LANGUAGES` eintragen. Die Befehlsmuster (`agent.match`) und Stichwörter (`agent.topic.*.keywords`) sind sprachabhängig und brauchen eigene Wörter. `npm test` (`test/i18n.test.js`) meldet fehlende oder überzählige Schlüssel und abweichende Platzhalter.

## Assistent „Frag Pomona“ (QVAC)

Details in [ASSISTANT.md](ASSISTANT.md). Kurz: `core/agent/` ist eine Schicht über dem Anwendungsdienst. Sie liest `status()`, rechnet mit `quoteBid()` und liefert Text plus *vorgeschlagene* Aktionen. Die UI setzt jede Aktion auf eine bestehende Seite um (Prüfseite beim Bieten, Bestätigung bei Rechnung und Zurückziehen). Das Sprachmodell läuft über `@qvac/inference` direkt im Bare-Worker.
