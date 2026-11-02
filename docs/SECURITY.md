# Sicherheit

Stand: Version 0.2. Dieses Dokument enthält das Bedrohungsmodell, die Ergebnisse der Prüfung von Version 0.1 und die Risiken, die bewusst offen bleiben. Die Prüfung ersetzt **kein** externes Audit.

## Was geschützt wird

| Gut | Wo es liegt |
|---|---|
| USDT der Bietenden im Escrow | `PomonaRound` |
| Seed-Phrase / Wallet | verschlüsselt im lokalen Hyperbee des Workers |
| USDT in der Wallet | Smart Account (Safe) auf der Chain |
| Echtheit der Runde (wer, wofür, wie viel) | Contract + Manifest |

**Angreifer, die betrachtet werden:**
- ein Fremder mit einem manipulierten Einladungslink
- ein bösartiger Peer im Hyperswarm
- ein Bieter, der zu viel zurückholen will
- ein Organisator, der mehr oder früher kassieren will
- jemand mit Zugriff auf die Festplatte
- Schadcode in der UI, etwa über eingeschleustes HTML

## Ergebnisse der Prüfung von Version 0.1 und was in 0.2 geändert wurde

| # | Befund in 0.1 | Schwere | Status in 0.2 |
|---|---|---|---|
| 1 | **Gefälschte Runde per Link.** Der Link enthielt eine beliebige Contract-Adresse. Die App hätte dafür `approve` signiert, und ein nachgebauter Contract hätte das Geld abziehen können. | Hoch | **Behoben.** `PomonaFactory.isRound` ist ein Register. Die App bricht ab, wenn die Runde nicht von der konfigurierten Factory stammt oder nicht in USDT läuft. Getestet in `flow.test.js` („forged rounds“). |
| 2 | **Seed im Klartext** auf der Festplatte. | Hoch | **Behoben.** Argon2id (libsodium `crypto_pwhash`) und XSalsa20-Poly1305 (`crypto_secretbox`). Die Wallet ist nach dem Start gesperrt. Seed anzeigen und Überweisungen nach außen verlangen das Passwort erneut. |
| 3 | **Unbegrenzte Rechte der Wallet.** Jeder Fehler in Kern oder UI hätte beliebige Transaktionen signieren können. | Mittel | **Behoben.** Eine WDK-Policy (default-deny) erlaubt nur: Calls an die eigene Runde, `createRound` an der Factory, `approve` von USDT ausschließlich an die eigene Runde, `transfer` nur in USDT. Native Werte sind nie erlaubt. Getestet in `unit.test.js` und `flow.test.js`. |
| 4 | **Ungeprüfte Daten von Peers** (Titel, Beschreibung, Neuigkeiten): beliebig groß, beliebige Typen. | Mittel | **Behoben.** Schema-Prüfung und Längenlimits (`p2p/manifest.js`, `config/limits.js`). Angezeigt werden die Daten nur escaped, und Beträge sowie der Organisator kommen immer vom Contract. |
| 5 | **Keine CSP** im Renderer. | Mittel | **Behoben.** CSP mit `script-src 'self'`, ohne Remote-Code, `object-src 'none'`. Alles, was in HTML landet, läuft durch `esc()`. |
| 6 | **RPC ohne Parameterprüfung.** | Niedrig | **Behoben.** Whitelist mit Schema (`rpc/methods.js`), `Object.hasOwn` statt Prototyp-Lookup, Größenlimit pro Nachricht. |
| 7 | **Faucet mit dem öffentlichen Hardhat-Key** wäre in jeder Version verfügbar gewesen. | Niedrig | **Behoben.** Die lokale Chain ist nur im Entwicklermodus erreichbar (`Pear.app.dev`). |
| 8 | **Gebühren-Token (ETH) nötig.** | – | **Behoben.** Mit ERC-4337 und USDT-Paymaster gibt es eine Gebührenobergrenze von 5 USDT pro Transaktion (`transactionMaxFee`). |
| 9 | Geld konnte im Contract hängen bleiben, wenn der Organisator verschwindet. | Mittel | **Behoben.** Ab `expiresAt` gilt die Runde als abgeschlossen, und die Bietenden holen den Rest zurück. |
| 10 | „Wiederherstellen“ hätte eine bestehende Wallet überschreiben können. | Mittel | **Behoben.** Ist bereits ein Tresor vorhanden, wird das abgelehnt. |

## Contract-Prüfung (0.2)

- **Reentrancy:** Alle Funktionen, die Geld bewegen, sind `nonReentrant`, und der Zustand wird vor der Überweisung gesetzt.
- **Rundung und Overflow:** Es gibt keine Division. Multiplikationen sind checked (Solidity ≥ 0.8). Gezahlt wird exakt `amount × installments` bzw. `total` pro Rechnung.
- **Fee-on-Transfer:** Das wird erkannt und abgelehnt (`UnsupportedToken`, getestet mit `FeeToken`).
- **Einladung:** Der Digest ist an `chainid`, die Contract-Adresse und `msg.sender` gebunden. Eine Signatur lässt sich weder für eine andere Adresse noch für eine andere Runde oder Chain verwenden (getestet). Abgefangene Signaturen sind für Dritte wertlos.
- **Zeit:** Es zählt `block.timestamp`, Abweichungen liegen im Bereich von Sekunden und sind bei Intervallen ab einem Tag unerheblich.
- **USDT-Blacklist:** Wird der Organisator gesperrt, schlagen Rechnungen fehl. Ab `expiresAt` holen die Bietenden den Rest zurück. Ist ein Bieter gesperrt, betrifft das nur ihn.
- **Keine Admin-Funktionen, kein Upgrade, kein `selfdestruct`.**

## Bewusst offene Risiken

| Risiko | Einschätzung und Umgang |
|---|---|
| **Der Contract ist nicht extern auditiert.** | Vor echtem Geld ist ein Audit Pflicht. |
| **WDK-Pakete sind Beta.** | Versionen sind über die Lockfiles fixiert. Vor einem Release erneut prüfen. |
| **Kompromittierte UI (XSS):** Sie kann den Seed nicht lesen und nicht nach außen überweisen, weil beides das Passwort braucht. Sie könnte aber bei einer neuen Wallet einer fremden, echten Runde beitreten und bieten. | Durch CSP und Escaping unwahrscheinlich. Nur eine Runde pro Instanz. Optional könnte man künftig auch Gebote mit dem Passwort bestätigen lassen. |
| **Sybil:** Der Organisator kann mit eigenem Geld (oder über Strohleute) bieten, damit das Ziel erreicht wirkt. | Lässt sich technisch nicht verhindern. Die Gebote sind öffentlich auf der Chain sichtbar. |
| **Invite-Key im Link:** Wer den Link hat, kann bieten. | Das ist so gewollt (Link = Berechtigung). Der Key schützt vor Spam, nicht das Geld. Den Link nicht öffentlich posten. |
| **Bieten in offenen Runden ohne Mindestgebot:** Kleinstbeträge sind möglich. | Kostet den Spammer Gebühren und schadet sonst nicht. Ein Mindestgebot setzen. |
| **Belege lassen sich weitergeben.** Ein Beleg beweist die Zahlung einer Adresse, nicht die Identität der Person, die ihn vorzeigt. | Für Abholnachweise reicht das. Für mehr bräuchte es eine Challenge-Response-Signatur der Bieter-Wallet. |
| **Vertrauen in den RPC-Anbieter:** Ein lügender RPC könnte falsche Stände anzeigen. Signieren und damit Geld bewegen kann er nicht. | Eigenen Node oder mehrere Anbieter nutzen (WDK unterstützt Failover über ein Array von Providern). |
| **Paymaster und Bundler:** Der Paymaster bekommt eine USDT-Freigabe für die Gebühren. | WDK prüft die Paymaster-Adresse gegen die Konfiguration. Seriöse Anbieter wählen und die Gebührenobergrenze aktiv lassen. |
| **IP-Adressen:** Peers im selben Hyperswarm-Topic sehen ihre IP-Adressen gegenseitig. | So funktioniert P2P. In der App erklären. |
| **Öffentliche Chain:** Gebote und Beträge sind öffentlich und pseudonym. | Für jede Person eine eigene Wallet nutzen. |
| **Offline-Brute-Force auf den Tresor:** Mit Zugriff auf die Festplatte lassen sich Passwörter raten. | Mindestens 8 Zeichen, Argon2id mit Parametern für interaktive Nutzung. Für Mainnet die Parameter erhöhen (sie werden im Tresor mitgespeichert, eine Migration ist also möglich) und eine automatische Sperre bei Inaktivität einbauen. |
| **Seed im Arbeitsspeicher**, solange die Wallet entsperrt ist. | JavaScript-Strings lassen sich nicht zuverlässig löschen. `lock()` entfernt alle Referenzen. |

## Prüfung von Version 0.4 (November 2026)

| # | Befund | Schwere | Status |
|---|---|---|---|
| 11 | **Belege ließen sich fälschen.** Ein Beleg enthielt nur öffentliche Daten (Netz, Runde, Adresse, Rate). Wer die Adresse eines zahlenden Mitglieds von der Blockchain abliest, konnte einen gültigen Beleg erzeugen, etwa für eine Abholung, ohne selbst bezahlt zu haben. | Hoch | **Behoben.** Belege (Format v2) sind mit dem Schlüssel des zahlenden Kontos unterschrieben (EIP-191). Beim Smart Account prüft der Anbieter on-chain `isOwner` am Safe. Sie gelten nur 10 Minuten, und die App erneuert den QR-Code, solange er offen ist. Manipulierte, fremd unterschriebene und alte Belege werden abgelehnt (`flow.test.js`). Die Wallet-Policy erlaubt `sign` nur für Beleg-Nachrichten. |
| 12 | **Passwort-Raten über die App** (z. B. bei kompromittierter Oberfläche) war unbegrenzt möglich. | Mittel | **Behoben.** Nach drei Fehlversuchen kommt eine exponentiell wachsende Sperre (5 s bis 5 min) für Entsperren, Notfall-Wörter und Senden. |
| 13 | **Last auf dem RPC-Anbieter:** Jede Statusabfrage las bis zu 520 Rechnungszeiten. Bei öffentlichen Anbietern drohte Drosselung. | Niedrig | **Behoben.** Die Zeiten ändern sich nie und werden zwischengespeichert. |
| 14 | Escaping in der Oberfläche: alle Werte geprüft. Werte aus dem Contract (z. B. Token-Symbol) laufen ebenfalls durch `esc()`. | – | Kein Befund. |

Verbleibend: Ein Beleg kann innerhalb seiner 10 Minuten weitergegeben werden (Screenshot). Für mehr bräuchte es eine Rückfrage an das Gerät der bietenden Person (Challenge-Response).

## Assistent „Frag Pomona“ (QVAC)

| Risiko | Gegenmaßnahme |
|---|---|
| Das Sprachmodell bewegt Geld | Es gibt kein Werkzeug dafür. Die Werkzeuge lesen (`calculate_bid`) oder schlagen eine Aktion vor. Eine Aktion öffnet nur eine Seite der App, signiert wird dort durch die Person. Der Assistent hat keinen Zugriff auf Wallet, Passwort oder Notfall-Wörter. |
| Prompt Injection über Titel, Beschreibung oder Neuigkeiten (kommen von anderen Peers) | Die Texte werden bereinigt (Chat-Template-Tokens, Tags, Begrenzer entfernt), gekürzt und als Daten eingezäunt. Der Systemprompt verbietet, Anweisungen daraus zu befolgen. Selbst wenn ein Modell gehorcht, entsteht höchstens ein Vorschlag, den die Person auf der Prüfseite sieht. Getestet in `test/assistant.test.js`. |
| Unpassende Vorschläge (falsche Rolle, Phase, Rate) | Jede Aktion wird gegen den aktuellen Status geprüft (`core/agent/actions.js`). Gebote werden vorher mit `quoteBid` gegen die Regeln des Contracts gerechnet. |
| Falsche Antworten (Halluzination) | Knopf-Vorschläge und Befehle laufen ohne Modell über geprüfte Texte. Antworten des Modells sind sichtbar gekennzeichnet („Lokale KI · kann sich irren“). Zahlen kommen aus dem Status, nicht aus dem Modell. |
| Privatsphäre | Das Modell läuft lokal (QVAC, llama.cpp). Fragen verlassen das Gerät nicht. Das Gespräch wird nicht gespeichert und beim Sperren gelöscht. |
| Manipuliertes Modell | QVAC prüft heruntergeladene Modelle gegen die SHA-256-Prüfsumme aus seinem Katalog. Der Katalog kommt mit dem npm-Paket, dessen Version über den Lockfile fixiert ist. |
| Download | Das Modell wird peer-to-peer aus der QVAC-Registry geladen. Dabei sind wie bei Hyperswarm IP-Adressen für die Gegenstellen sichtbar. |

## Vor einem Mainnet-Einsatz

1. Externes Audit von `PomonaRound` und `PomonaFactory`.
2. Bundler und Paymaster (USDT) eines seriösen Anbieters konfigurieren und auf Sepolia testen.
3. Argon2id-Parameter erhöhen und eine automatische Sperre bei Inaktivität einbauen.
4. Mehrere RPC-Anbieter als Failover eintragen.
5. Den Pear-Release-Key sicher verwahren (er signiert die App-Updates).
6. Abhängigkeiten prüfen (`npm audit`) und Versionen der WDK-Pakete neu bewerten.

## Melden

Sicherheitslücken bitte nicht öffentlich als Issue melden, sondern direkt an den Maintainer.
