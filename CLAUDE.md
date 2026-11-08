# Pomona

Start here: `POMONA_PROJECT_NOTES.md` (Stand, Entscheidungen, NEXT; auf Englisch führen). `/pickup` setzt dort an, `/wrapup` schreibt den Stand zurück.

## Arbeitsweise (Tokens sparen)
- Große Dateien nie ganz lesen: erst `grep -n` / `sed -n`, dann gezielt Read mit offset/limit.
- Lange Ausgaben in eine Datei umleiten und darin suchen.
- Knapp antworten, keine Zusammenfassung des gerade Getanen, eben bearbeitete Dateien nicht erneut lesen.
- Lange Checks (`npm test`) nicht nach jedem Schritt, sondern gezielt oder beim Versionieren.
- Sitzung lang oder Thema neu: `/wrapup`, dann neue Sitzung mit `/pickup`.

## Projekt
- `contracts/` Solidity (PomonaRound, PomonaFactory), `app/` Desktop-App (Electron + pear-runtime, Bare-Worker, UI), `docs/` Doku.
- Commits auf `main`. README, `docs/` und Projektnotizen auf Englisch (`README.de.md` als deutsche Fassung mitpflegen); UI-Texte in `app/i18n/` (de, en, es). Wortlaut des Nutzers genau übernehmen.
