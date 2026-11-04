# Contracts

Es gibt zwei Contracts in `contracts/src`, Solidity 0.8.28, EVM-Version Paris, OpenZeppelin 5.0.2. Beide haben keine Admin-Rechte und sind nicht upgradebar.

## PomonaFactory

Wird einmal pro Chain deployt und ist fest an einen Token gebunden (USDT).

| Funktion | Zweck |
|---|---|
| `createRound(mode, target, minBid, biddingEnd, interval, installments, inviteSigner)` | Legt eine Runde an. Der Aufrufer wird Organisator. `mode`: 0 = Vorab hinterlegen, 1 = Per Rechnung. |
| `isRound(address) → bool` | **Register.** Die App spricht nur mit Runden, für die das `true` ist. |
| `roundsOf(organizer) → address[]` | Alle Runden eines Organisators |
| `token() → address` | Der Token aller Runden dieser Factory |

## PomonaRound

### Parameter (unveränderlich)

| Feld | Bedeutung |
|---|---|
| `mode` | Wie bezahlt wird, siehe unten: `Deposit` (vorab hinterlegen) oder `Invoice` (per Rechnung) |
| `target` | Ziel **pro Rate** (z. B. 4.000 USDT pro Monat) |
| `minBid` | Mindestgebot pro Rate |
| `biddingEnd` | Ende von Phase 1, zugleich Fälligkeit der ersten Rechnung |
| `interval` | Abstand zwischen Rechnungen: 1 bis 366 Tage. Die App bietet 7 Tage (Woche) und 30 Tage (Monat) an. |
| `installments` | Wie oft der Organisator abrechnen darf: 1 bis 520 |
| `inviteSigner` | Adresse des Invite-Keys oder `0x0` für offene Runden |

### Zwei Arten zu bezahlen (`mode`)

| | Deposit: „Vorab hinterlegen“ | Invoice: „Per Rechnung“ |
|---|---|---|
| Beim Bieten | `amount × installments` geht ins Treuhandkonto | Nichts. Das Gebot ist eine Zusage. |
| Rechnung | Der Organisator ruft `invoice()` auf, höchstens einmal pro Intervall | Rechnung `i` gilt ab `biddingEnd + i × interval` automatisch als gestellt |
| Zahlung | `invoice()` zahlt eine Rate **aller** Gebote aus dem Treuhandkonto an den Organisator | Jeder Bieter ruft `pay(i)` auf. Sein Gebot geht direkt aus seiner Wallet an den Organisator. |
| Beleg | Für alle Bietenden, sobald die Rate abgerechnet ist | Nur für Bietende, die `pay(i)` aufgerufen haben |
| Ziel verfehlt, Abbruch | `refund()`: alles zurück | Keine Rechnungen, es wurde nichts bezahlt |
| Vorzeitiges Ende | `refund()` der nicht abgerechneten Raten | Keine neuen Rechnungen. Gestellte bleiben bezahlbar. |
| Garantie | Das Geld ist da | Keine: Wer nicht zahlt, zahlt nicht. Der Organisator sieht offene Rechnungen. |

Offene Rechnungen bleiben bezahlbar, auch nach Ende der Runde, aber jede nur einmal. Reicht das Guthaben nicht, scheitert `pay(i)`, und es gibt keinen Beleg.

### Phasen

```
                 cancel()
   ┌─────────┐ ─────────────────────────────────────────┐
   │ Bidding │                                          ▼
   └────┬────┘   biddingEnd, total < target        ┌────────┐
        ├─────────────────────────────────────────▶│ Failed │  refund(): alles zurück
        │ biddingEnd, total ≥ target               └────────┘
        ▼
   ┌─────────┐   invoiceCount == installments
   │ Running │   oder terminate()               ┌───────────┐
   │         │ ────────────────────────────────▶│ Completed │  refund(): nicht abgerechnete
   └─────────┘   oder now ≥ expiresAt           └───────────┘           Raten zurück
     invoice() höchstens einmal pro Intervall
```

Die Phase wird nie gespeichert, sondern immer aus Zeit und Zustand berechnet (`phase()`). Im Modus Invoice gibt es kein `invoice()` und kein `refund()`. Running endet dort mit `terminate()` oder bei `expiresAt`.

### Funktionen

| Funktion | Wer | Phase | Wirkung |
|---|---|---|---|
| `bid(amount, invite)` | jeder mit Wallet, auch der Organisator | Bidding | Gebot pro Rate erhöhen. Deposit: zieht `amount × installments` ein. Invoice: nur die Zusage, bezahlt wird je Rechnung. Beim ersten Gebot wird die Einladung geprüft. |
| `withdraw(amount)` | Bieter | Bidding | Gebot senken (Deposit: `amount × installments` zurückzahlen). Der Rest muss 0 oder ≥ `minBid` sein. |
| `invoice()` | Organisator | Running | Nur Deposit: Zahlt `total` an den Organisator, ab `biddingEnd + invoiceCount × interval` |
| `pay(i)` | Bieter | Running / Completed | Nur Invoice: Zahlt das eigene Gebot für die gestellte Rechnung `i` an den Organisator (braucht `approve`). Einmal pro Rechnung. Hat der Organisator selbst geboten, wird seine eigene Zahlung nur vermerkt (Beleg, `paidCount`, `paidSum`), überwiesen wird nichts. |
| `invoiceCount() → n` | alle | – | Gestellte Rechnungen. Deposit: vom Organisator abgerechnet. Invoice: nach Zeit, begrenzt durch `installments` und `terminate()`. |
| `issuedAt(i)` | alle | – | Zeitpunkt, zu dem Rechnung `i` gestellt wurde, sonst 0 |
| `paidAt(bieter, i)`, `paidCount(i)`, `paidSum(i)` | alle | – | Nur Invoice: wer bezahlt hat, wie viele, wie viel |
| `unpaid(i) → (bieter[], beträge[])` | alle | – | Nur Invoice: Bietende mit offener Rechnung `i` |
| `terminate()` | Organisator | Running | Beendet die Abrechnung vorzeitig |
| `cancel()` | Organisator | Bidding | Bricht die Runde ab, alles geht zurück |
| `refund()` | Bieter | Failed / Completed | `refundable(bieter)` auszahlen, einmalig |
| `receipt(bieter, i) → (amount, paidAt)` | alle | – | Beleg für Rate `i`. `(0, 0)`, wenn sie nicht abgerechnet bzw. (Invoice) nicht bezahlt ist oder der Bieter nicht beteiligt war. |
| `info()` | alle | – | Alle Kennzahlen in einem Aufruf |

### Invarianten

- Deposit: Das Guthaben des Contracts ist mindestens `total × (installments − invoiceCount)`, solange nicht erstattet wird. Erstattungen gibt es nur in Failed und Completed, und dann keine Rechnungen mehr.
- Ein Gebot ändert sich nach `biddingEnd` nicht mehr. Damit bleiben Belege stabil.
- Kein Geld bleibt hängen: Zahlt der Organisator nie ab, wird die Runde bei `expiresAt` zu Completed, und alle erhalten den Rest.
- Tokens mit Gebühr bei der Überweisung werden abgelehnt (`UnsupportedToken`). USDT hat einen solchen Schalter, der aktuell auf 0 steht.
- Invoice: Der Contract hält nie Geld. `pay` überweist direkt vom Bieter an den Organisator und prüft, dass genau der Betrag ankommt.
- Invoice: Ein Bieter zahlt pro Rechnung höchstens einmal und nie mehr als sein Gebot.
- Alle Funktionen, die Geld bewegen, sind `nonReentrant` und folgen Checks-Effects-Interactions.

### Ereignisse

`Bid`, `Withdrawn`, `Invoiced(index, amount, at)`, `Paid(bidder, index, amount, at)`, `Refunded`, `Cancelled`, `Terminated`, in der Factory `RoundCreated(round, organizer)`.

### Fehler

`BadParams`, `WrongPhase`, `NotOrganizer`, `ZeroAmount`, `BelowMinBid`, `InvalidInvite`, `TooMuch`, `NotDue`, `NothingToRefund`, `UnsupportedToken`, `WrongMode`, `NotIssued`, `NotBidder`, `AlreadyPaid`. Die App übersetzt sie in `app/core/chain/reverts.js`.

## Bauen, testen, deployen

```bash
cd contracts
npm install
npm test                                   # kompiliert und führt 14 Tests aus
npm run chain                              # lokale Chain auf :8545
node scripts/deploy.js local               # MockUSDT + Factory → app/core/config/deployments.js
RPC=… PRIVATE_KEY=… node scripts/deploy.js sepolia
RPC=… PRIVATE_KEY=… TOKEN=0xdAC17F958D2ee523a2206206994597C13D831ec7 node scripts/deploy.js ethereum
```

Vor einem Mainnet-Einsatz: externes Audit, siehe [SECURITY.md](SECURITY.md).
