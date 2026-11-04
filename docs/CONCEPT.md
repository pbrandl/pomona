# Konzept: Rundentypen, Wallet-Dienst, Swap-Dienst

**Stand: Konzept, nicht umgesetzt.** Festgehalten im November 2026. Erst wird die
aktuelle App in Pear gebaut, danach geht es hier weiter.

## Ziel

Pomona soll verschiedene Contracts laden können, die nach derselben Mechanik
funktionieren (Phase 1 → Ziel → Raten oder Rechnungen → Belege → Abschluss
oder Rückzahlung), aber unterschiedliche Oberflächen brauchen. Die Wallet wird
aus der App gelöst und als eigener Dienst angeboten. Ein Swap-Dienst hilft der
Wallet, mit den richtigen Coins zu bieten.

```
Pomona-App                         Wallet-Dienst                  Swap-Dienst
Runden, P2P, Rundentypen,   ──►    Schlüssel, Signieren,    ──►   Tauschen, Bridgen,
Oberfläche, Assistent              Regeln, Bestätigung,           Kaufen (On-Ramp)
schlägt nur Aufrufe vor            „Aufladen“                     nie mit fremdem Geld
```

## 1. Rundentypen als Module

Heute stecken die Unterschiede zwischen „Vorab hinterlegen“ und „Per Rechnung“
in rund 47 Verzweigungen (`mode === 'invoice'`) über 13 Dateien in Kern,
Oberfläche und Assistent. Jede weitere Art würde das vervielfachen.

Ein Rundentyp ist ein Paket aus vier Teilen:

1. **Contract:** erfüllt eine gemeinsame Schnittstelle (Phase, Gebote, Raten,
   Belege, Rückzahlung), darf eigene Funktionen haben und meldet seinen Typ
   (z. B. `pomona.rechnung/1`). Eine Factory je Typ, alle in einer Registry je Netz.
2. **Kern-Adapter** (`core/types/<typ>/`): übersetzt den Contract ins gemeinsame
   Statusformat (Phase, Ziel, Summen, `invoices`, `myInvoices`, …) plus
   Typ-Eigenes; listet seine Aktionen mit Prüfung, Kostenvorschau und Aufrufen.
   Daraus ergeben sich die Rechte, die die App bei der Wallet anfragt.
3. **Oberfläche** (`ui/types/<typ>/`): setzt die Rundenseite aus Bausteinen
   zusammen (Kopf, Ring, „Dein Gebot“, Zeitleiste, Neuigkeiten, Verwalten) und
   liefert eigene Bausteine, Abläufe und Wörter („Rate“, „Rechnung“, „Anteil“).
4. **Assistent-Wissen:** Themen und Befehle des Typs.

- **Typ erkennen:** über die Chain, nicht über das Manifest. Einladung →
  Rundenadresse → Registry: von welcher Factory? → passendes Modul. Ein
  unbekannter Typ führt zu „Diese Runde braucht eine neuere Pomona-Version.“
- **Code statt Nachladen:** Typen sind Code, der mit der App ausgeliefert wird
  (geprüft, versioniert, über Pear-Updates). Nie Oberflächen- oder Kern-Code von
  Peers laden. Kleine Varianten eines Typs (Wörter, Standardwerte) dürfen als
  Daten kommen.
- **RPC:** `quote` und `act` mit dem Namen der Aktion statt einer Methode je
  Aktion. Die erlaubten Aktionen bleiben eine geschlossene Liste, die vom Typ kommt.
- **Tests:** eine gemeinsame Suite für die Schnittstelle gegen jeden Contract und
  Adapter, dazu Tests je Typ und `npm run ui-check` mit Mock-Szenarien je Typ.

Reihenfolge:

1. Die beiden heutigen Arten als erste Typen herausziehen; Tests und ui-check
   belegen, dass sich nichts ändert.
2. Contract: Typ-Kennung, Factory je Typ, Registry.
3. Typ-Register in der App, Update-Hinweis bei unbekannten Typen.
4. Erster neuer Typ als Beweis.

## 2. Wallet als eigener Dienst

Grundregel: **Die App unterschreibt nie selbst.** Sie schickt der Wallet
vorbereitete Aufrufe (z. B. Freigabe 1.200 USDT an Runde 0x…, dann `bid(100)`).
Die Wallet entschlüsselt sie selbst, zeigt sie verständlich an, und bestätigt
wird dort. Alles, was in der App schiefgehen kann (manipulierte Peer-Daten, ein
fehlerhafter Rundentyp, ein überredetes Sprachmodell), kommt nicht mehr an die
Schlüssel.

- **Ausgangslage:** Die Trennlinie gibt es schon: Der Kern bereitet Aufrufe vor
  (`_prepareBid` → `calls`), `core/wallet/` führt sie aus.
- **Produkt:** eigene Pear-App (Desktop und Handy) auf WDK, mit Smart Account,
  Gebühren in der Währung selbst, Passphrase, eigener Bestätigungsoberfläche.
- **Verbindung:** peer-to-peer über HyperDHT mit verschlüsseltem Kanal, gekoppelt
  per QR-Code, ohne Relay-Server. Etwa die Wallet auf dem Handy, Pomona auf dem Laptop.
- **Sitzungen mit Rechten:** z. B. „Runde 0x…: bieten, bezahlen, zurückholen,
  höchstens 100 USDT pro Rechnung“. Die Regeln (heute `core/wallet/policy.js`)
  wandern in die Wallet. Jede Geldbewegung wird in der Wallet bestätigt.
- **Standards:** EIP-1193, EIP-5792 (gebündelte Aufrufe), EIP-712 (signierte
  Daten), damit die Pomona-Wallet auch mit anderen dApps und Pomona auch mit
  anderen Wallets funktioniert.
- **Bleibt in der App:** Runden, Einladungen (der Einladungsschlüssel ist kein
  Geld), Belege prüfen (Chain-Abfrage), Kontostände lesen (Adresse ist öffentlich).
- **Übergang:** zuerst im selben Paket mitliefern, aber getrennt (eigener
  Bare-Prozess, eigener Speicher, eigene Bestätigung); Umzug aufs Handy später.

### Austauschbare Verbindungen

Die App spricht nie direkt mit einer bestimmten Wallet, sondern über
Verbindungen, die dieselben vorbereiteten Aufrufe übergeben:

1. **Pomona-Wallet** (P2P-Kopplung).
2. **tether.wallet** (seit 14. April 2026, WDK-basiert, USDT/XAUT auf Ethereum,
   Polygon, Plasma, Arbitrum, USAT auf Ethereum, Bitcoin mit Lightning). Ob es
   Anfragen von Apps annimmt (WalletConnect, Deep Link, eigenes Protokoll), ist
   offen. **Bei Tether klären.**
3. **WalletConnect** für andere Wallets.
4. **Zahladresse** für jede Wallet ohne Verbindung (siehe unten).

Nicht empfohlen: dieselbe Passphrase in zwei Apps eingeben.

### Zahladresse (für Wallets ohne Verbindung)

Eine normale Überweisung läuft am Runden-Contract vorbei (kein Gebot, kein
Beleg). Deshalb bekommt jede bietende Person pro Runde eine eigene Zahladresse:
einen kleinen Weiterleitungs-Contract mit fester, vorher berechenbarer Adresse
(CREATE2). Sie schickt aus ihrer Wallet einfach Geld dorthin, wie eine
Überweisung mit Verwendungszweck. Ein Aufruf leitet es in die Runde weiter und
vermerkt Gebot oder Zahlung auf ihren Namen, mit Beleg.

**Entschieden:**

- **Gebühr zahlt immer der Sender.** Sie steckt im überwiesenen Betrag
  („Sende 100,05 USDT: 100 Rechnung + 0,05 Weiterleitung“). Das Weiterleiten darf
  jeder auslösen (App der Person, Organisator, Relayer) und erhält dafür die
  Gebühr; im Contract gedeckelt. Zu viel gezahlt → Rest an die
  Rückzahlungsadresse. Zu wenig → nichts vermerkt, das Geld wartet aufs Aufstocken.
- **Rückzahlungen gehen an eine Change-Adresse derselben Wallet.** Die Wallet
  liefert sie beim Anlegen der Zahladresse; sie wird fest eingetragen und kann
  nicht umgelenkt werden. Nie die Absenderadresse nehmen (bei Börsen gehört sie
  der Börse).

**Zu beachten:** Auf EVM gibt es keine Change-Adressen wie bei Bitcoin. Eine
neu abgeleitete Adresse muss die Wallet auch anzeigen, sonst wirkt die
Rückzahlung verloren.

## 3. Währungen und Swap-Dienst

**Entschieden:** Pomona nutzt nur **EURC, USDT und BTC** (niedrige Gebühren).
Wer mit anderen Coins zahlt, kann tauschen, trägt aber die Gebühren.

- **Eine Währung pro Runde,** beim Anlegen festgelegt (z. B. EURC für ein
  Projekt im Euroraum). Keine Umrechnung innerhalb einer Runde.
- **EURC und USDT** auf derselben EVM-Mechanik. Nötig ist eine Chain mit beiden;
  Arbitrum hat EURC laut Sekundärquellen, an Circles Adressliste prüfen.
- **BTC:** kein Runden-Contract auf Bitcoin. Wege:
  1. Mit BTC bezahlen, Runde in USDT oder EURC (Tausch beim Zahlen). Zum Start.
  2. Wrapped BTC auf der EVM-Chain (gleiche Mechanik, Vertrauen in den Wrapper).
  3. Eigener Rundentyp über Lightning: jede Rechnung eine Lightning-Rechnung, der
     Preimage ist der Beleg; die Buchführung liegt dann nicht in einem Contract.
- **Swap-Dienst:** Die App meldet den Bedarf („1.200 USDT auf Arbitrum für diese
  Aufrufe“). Die Wallet bietet an: tauschen auf derselben Chain (am besten
  gebündelt: Tausch + Freigabe + Gebot mit einer Bestätigung), von einer anderen
  Chain holen (z. B. USDT0), kaufen (On-Ramp). Bei „Per Rechnung“ auch „Tauschen
  und bezahlen“. Feste Höchstwerte für Kursabweichung und Gebühren, exakter
  Zielbetrag. Der Dienst rechnet Routen und baut Aufrufe; unterschreiben tut die
  Wallet. WDK hat Module für Swaps und Bridges (prüfen).
- **Regulierung:** Tauschen als Dienst (besonders gegen Gebühr) kann in der EU
  unter MiCA eine Zulassung als Krypto-Dienstleister erfordern. Früh klären.

## Offene Fragen

1. Wallet zuerst mitgeliefert (getrennt) oder sofort eigene App?
2. Soll Pomona mit fremden Wallets (MetaMask, Safe, …) funktionieren?
3. tether.wallet: Wie nimmt es Anfragen von Apps an? (bei Tether klären)
4. EVM-Rückzahlung: neue abgeleitete Adresse (Privatsphäre, nur mit passenden
   Wallets) oder Hauptadresse (funktioniert überall)? Vorschlag: eigene Wallet
   neue Adresse, fremde Wallets Hauptadresse.
5. Überzahlung bei „Per Rechnung“: zurückzahlen oder als Guthaben für die
   nächste Rechnung?
6. Reicht für den Start „mit BTC bezahlen“ über Tausch?
7. Welche zwei, drei Rundentypen kommen als Nächstes? Was gehört zur „selben
   Mechanik“ (auch Einmalzahlung, ohne Ziel, feste Preise)?
8. Sollen Dritte Rundentypen bauen können?
