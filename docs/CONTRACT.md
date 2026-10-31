# Contracts

Es gibt zwei Contracts in `contracts/src`, Solidity 0.8.28, EVM-Version Paris, OpenZeppelin 5.0.2. Beide haben keine Admin-Rechte und sind nicht upgradebar.

## PomonaFactory

Wird einmal pro Chain deployt und ist fest an einen Token gebunden (USDT).

| Funktion | Zweck |
|---|---|
| `createRound(target, minBid, biddingEnd, interval, installments, inviteSigner)` | Legt eine Runde an. Der Aufrufer wird Organisator. |
| `isRound(address) → bool` | **Register.** Die App spricht nur mit Runden, für die das `true` ist. |
| `roundsOf(organizer) → address[]` | Alle Runden eines Organisators |
| `token() → address` | Der Token aller Runden dieser Factory |

## PomonaRound

### Parameter (unveränderlich)

| Feld | Bedeutung |
|---|---|
| `target` | Ziel **pro Rate** (z. B. 4.000 USDT pro Monat) |
| `minBid` | Mindestgebot pro Rate |
| `biddingEnd` | Ende der Bietphase, zugleich Fälligkeit der ersten Rechnung |
| `interval` | Abstand zwischen Rechnungen: 1 bis 366 Tage. Die App bietet 7 Tage (Woche) und 30 Tage (Monat) an. |
| `installments` | Wie oft der Organisator abrechnen darf: 1 bis 520 |
| `inviteSigner` | Adresse des Invite-Keys oder `0x0` für offene Runden |

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

Die Phase wird nie gespeichert, sondern immer aus Zeit und Zustand berechnet (`phase()`).

### Funktionen

| Funktion | Wer | Phase | Wirkung |
|---|---|---|---|
| `bid(amount, invite)` | Bieter | Bidding | Gebot pro Rate erhöhen. Zieht `amount × installments` ein. Beim ersten Gebot wird die Einladung geprüft. |
| `withdraw(amount)` | Bieter | Bidding | Gebot senken und `amount × installments` zurückzahlen. Der Rest muss 0 oder ≥ `minBid` sein. |
| `invoice()` | Organisator | Running | Zahlt `total` an den Organisator, ab `biddingEnd + invoiceCount × interval` |
| `terminate()` | Organisator | Running | Beendet die Abrechnung vorzeitig |
| `cancel()` | Organisator | Bidding | Bricht die Runde ab, alles geht zurück |
| `refund()` | Bieter | Failed / Completed | `refundable(bieter)` auszahlen, einmalig |
| `receipt(bieter, i) → (amount, paidAt)` | alle | – | Beleg für Rate `i`. `(0, 0)`, wenn sie nicht abgerechnet ist oder der Bieter nicht beteiligt war. |
| `info()` | alle | – | Alle Kennzahlen in einem Aufruf |

### Invarianten

- Das Guthaben des Contracts ist mindestens `total × (installments − invoiceCount)`, solange nicht erstattet wird. Erstattungen gibt es nur in Failed und Completed, und dann keine Rechnungen mehr.
- Ein Gebot ändert sich nach `biddingEnd` nicht mehr. Damit bleiben Belege stabil.
- Kein Geld bleibt hängen: Zahlt der Organisator nie ab, wird die Runde bei `expiresAt` zu Completed, und alle erhalten den Rest.
- Tokens mit Gebühr bei der Überweisung werden abgelehnt (`UnsupportedToken`). USDT hat einen solchen Schalter, der aktuell auf 0 steht.
- Alle Funktionen, die Geld bewegen, sind `nonReentrant` und folgen Checks-Effects-Interactions.

### Ereignisse

`Bid`, `Withdrawn`, `Invoiced(index, amount, at)`, `Refunded`, `Cancelled`, `Terminated`, in der Factory `RoundCreated(round, organizer)`.

### Fehler

`BadParams`, `WrongPhase`, `NotOrganizer`, `ZeroAmount`, `BelowMinBid`, `InvalidInvite`, `TooMuch`, `NotDue`, `NothingToRefund`, `UnsupportedToken`. Die App übersetzt sie in `app/core/chain/reverts.js`.

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
