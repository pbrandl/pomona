/**
 * Clear commands the assistant understands without a language model:
 * "Ich möchte 100 im Monat bieten", "Konto aufladen", "Zeig meinen Beleg für
 * Rate 2", "Rechnung stellen". Fast, predictable, offline, and the same in
 * every runtime. Anything less clear goes to the model (or the FAQ).
 *
 * @module core/agent/intents
 */
import { num, per, normalizeAmount } from './words.js'

const AMOUNT = /(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,6}))?\s*(usdt|usd|dollar|\$|euro|eur|€)?/i

/** Extracts the first amount and its currency word from free text. */
export function findAmount (text) {
  const m = AMOUNT.exec(text)
  if (!m) return null
  const raw = m[2] ? `${m[1].replace(/\./g, '')}.${m[2]}` : m[1]
  const amount = normalizeAmount(raw)
  if (!amount) return null
  return { amount, currency: (m[3] || '').toLowerCase() }
}

/**
 * @param {string} text
 * @param {object} s - status() snapshot
 * @returns {{ text: string, actions: object[] }|null}
 */
export function matchIntent (text, s) {
  const t = String(text).toLowerCase()
  const r = s?.round

  // "Ich möchte 100 im Monat bieten", "Gebot 80", "erhöhe um 20"
  if (/\b(biet|biete|bieten|gebot|beitragen|geben|erhöh)/.test(t)) {
    const found = findAmount(t)
    if (found && r?.phase === 'bidding') {
      const p = per(r.intervalName)
      const euro = /euro|eur|€/.test(found.currency)
      const raise = Number(r.myPledge) > 0
      const money = r.mode === 'invoice'
        ? `Hinterlegt wird nichts: Du bezahlst jede der ${r.installments} Rechnungen, wenn sie kommt.`
        : `Hinterlegt werden ${num(Number(found.amount) * r.installments)} ${r.symbol} für ${r.installments} Raten.`
      let reply = `${raise ? 'Ich bereite eine Erhöhung um' : 'Ich bereite ein Gebot über'} ${num(found.amount)} ${r.symbol} ${p.per} vor. ${money} Du prüfst und bestätigst auf der nächsten Seite.`
      if (euro) reply = 'Kurzer Hinweis: Pomona rechnet in USDT, das entspricht ungefähr US-Dollar, nicht Euro. ' + reply
      return { text: reply, actions: [{ type: 'bid', amount: found.amount }] }
    }
    if (found && r) return { text: 'Bieten geht nur während der Bietphase. Diese Runde ist schon weiter.', actions: [] }
  }

  if (/\b(aufladen|einzahlen|guthaben aufladen|usdt (kaufen|bekommen|senden))/.test(t)) {
    return { text: 'Hier ist deine Seite zum Aufladen, mit Adresse und QR-Code. Bitte nur USDT schicken, nur über das angezeigte Netzwerk.', actions: [{ type: 'open', page: 'fund' }] }
  }

  if (/\b(beleg|quittung|nachweis)/.test(t) && !/prüf|pruef|scan/.test(t)) {
    const paid = (r?.myInvoices || []).filter((x) => x.status === 'paid')
    if (!paid.length) return { text: 'Du hast noch keinen Beleg. Der erste kommt mit der ersten Rechnung.', actions: [] }
    const n = /rate\s*(\d+)/.exec(t)
    const pick = n ? paid.find((x) => x.index === Number(n[1]) - 1) : paid.at(-1)
    if (!pick) return { text: `Für Rate ${n[1]} gibt es noch keinen Beleg. Bezahlt sind bisher ${paid.length} ${paid.length === 1 ? 'Rate' : 'Raten'}.`, actions: [] }
    return { text: `Hier ist dein Beleg für Rate ${pick.index + 1}. Zeig den QR-Code beim Anbieter vor.`, actions: [{ type: 'receipt', index: pick.index }] }
  }

  if (/(beleg|qr).{0,20}(prüf|pruef|scan)|(prüf|pruef|scann).{0,20}(beleg|qr)/.test(t)) {
    if (r?.role === 'organizer') return { text: 'Öffne die Prüfung und halte den QR-Code des Belegs vor die Kamera, oder füge den Code ein.', actions: [{ type: 'open', page: 'scan' }] }
    return null
  }

  if (/rechnung (stellen|schreiben|erstellen)|abrechnen/.test(t) && r?.role === 'organizer') {
    if (r.canInvoice) return { text: `Rechnung ${r.invoiceCount + 1} ist fällig: ${num(r.total)} ${r.symbol} gehen an dein Konto. Bestätigen musst du selbst.`, actions: [{ type: 'invoice' }] }
    return { text: 'Gerade ist keine Rechnung fällig.', actions: [] }
  }

  if (/(rechnung|rate) (be)?zahlen|bezahlen/.test(t) && r?.mode === 'invoice') {
    if (r.openInvoices > 0) return { text: `Offen sind ${num(r.openAmount)} ${r.symbol}. Prüfen und bestätigen musst du selbst, danach bekommst du den Beleg.`, actions: [{ type: 'pay' }] }
    return { text: 'Gerade ist keine Rechnung offen.', actions: [] }
  }

  if (/zurückziehen|zurueckziehen|gebot (löschen|loeschen|stornieren)/.test(t)) {
    if (r?.phase === 'bidding' && Number(r.myPledge) > 0) {
      const back = Number(r.myDeposit) > 0 ? ` ${num(r.myDeposit)} ${r.symbol} gehen dann in dein Konto zurück.` : ''
      return { text: `Du kannst dein Gebot bis zum Ende der Bietphase zurückziehen.${back}`, actions: [{ type: 'withdraw' }] }
    }
    return null
  }

  if (/(geld|betrag) zurück(holen|bekommen)?|zurückholen|rückzahlung/.test(t) && Number(r?.refundable) > 0) {
    return { text: `Für dich liegen ${num(r.refundable)} ${r.symbol} bereit.`, actions: [{ type: 'refund' }] }
  }

  return null
}
