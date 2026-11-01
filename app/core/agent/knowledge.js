/**
 * What the assistant knows without a language model: answers to the common
 * questions, written for people without crypto background and filled with the
 * live numbers of the round. Used for the suggestion buttons, as a fallback
 * when no model is installed, and as background knowledge for the model.
 *
 * Pure functions on the status() snapshot; runs in Bare, Node and the browser.
 *
 * @module core/agent/knowledge
 */
import { num, day, until, per } from './words.js'

/**
 * @typedef {Object} Answer
 * @property {string} text
 * @property {Array<object>} [actions] - proposals, validated later
 */

const pledged = (r) => Number(r?.myPledge) > 0

/** @type {Record<string, { question: string, keywords: string[], answer: (s: object) => Answer }>} */
export const TOPICS = {
  how: {
    question: 'Wie funktioniert die Bietrunde?',
    keywords: ['wie funktioniert', 'erklär', 'was ist', 'ablauf', 'bietrunde', 'pomona'],
    answer: (s) => {
      const r = s.round
      const p = per(r?.intervalName)
      const plan = r ? ` In dieser Runde: ${r.installments} Raten, ${p.adj}, ab ${day(r.biddingEnd)}.` : ''
      return {
        text: 'Alle sagen in der Bietphase, wie viel sie pro Rate geben möchten. Das Geld für alle Raten liegt dann in einem Treuhand-Contract, nicht beim Organisator. ' +
          'Ist nach der Bietphase das Ziel erreicht, stellt der Organisator Rate für Rate eine Rechnung. Für jede bezahlte Rate bekommst du einen Beleg. ' +
          'Wird das Ziel nicht erreicht, bekommen alle ihr Geld zurück.' + plan
      }
    }
  },
  failed: {
    question: 'Was passiert, wenn das Ziel nicht erreicht wird?',
    keywords: ['nicht erreicht', 'verfehlt', 'scheitert', 'zu wenig', 'ziel'],
    answer: (s) => {
      const r = s.round
      const refund = r && Number(r.refundable) > 0
      return {
        text: 'Dann findet keine Ratenzahlung statt, und alle holen ihren hinterlegten Betrag vollständig aus dem Contract zurück. Niemand kann das Geld in diesem Fall abbuchen, auch der Organisator nicht.' +
          (refund ? ` Für dich liegen gerade ${num(r.refundable)} ${r.symbol} zum Zurückholen bereit.` : ''),
        actions: refund ? [{ type: 'refund' }] : []
      }
    }
  },
  howmuch: {
    question: 'Wie viel soll ich bieten?',
    keywords: ['wie viel', 'wieviel', 'richtwert', 'empfehl', 'soll ich bieten', 'betrag'],
    answer: (s) => {
      const r = s.round
      if (!r) return { text: 'Sobald du einer Runde beigetreten bist, sage ich dir Ziel, Richtwert und Stand.' }
      const p = per(r.intervalName)
      const missing = Math.max(0, Number(r.target) - Number(r.total))
      let text = `Das Ziel sind ${num(r.target)} ${r.symbol} ${p.per}, bisher sind ${num(r.total)} ${r.symbol} zugesagt (${Math.round(r.progress * 100)} %).`
      if (r.guide) text += ` Der Richtwert liegt bei ${num(r.guide)} ${r.symbol} ${p.per}. Gib, was du kannst: Wer mehr kann, gleicht für andere aus.`
      else if (missing > 0) text += ` Es fehlen noch ${num(missing)} ${r.symbol} ${p.per}.`
      if (Number(r.minBid) > 0) text += ` Das Mindestgebot ist ${num(r.minBid)} ${r.symbol}.`
      text += ` Hinterlegt wird dein Betrag mal ${r.installments} Raten.`
      return { text, actions: r.phase === 'bidding' && r.guide ? [{ type: 'bid', amount: r.guide }] : [] }
    }
  },
  change: {
    question: 'Kann ich mein Gebot noch ändern?',
    keywords: ['ändern', 'erhöhen', 'zurückziehen', 'weniger', 'mehr bieten', 'storn'],
    answer: (s) => {
      const r = s.round
      if (!r || r.phase !== 'bidding') {
        return { text: 'Nach der Bietphase stehen die Gebote fest. Nur so kann der Organisator mit dem Geld planen.' }
      }
      const text = `Ja, bis ${day(r.biddingEnd)} (${until(r.biddingEnd, r.now)}) kannst du erhöhen oder dein Gebot ganz zurückziehen. Das Geld geht dann sofort in dein Konto zurück.`
      return { text, actions: pledged(r) ? [{ type: 'withdraw' }] : [] }
    }
  },
  next: {
    question: 'Wann ist die nächste Rate?',
    keywords: ['nächste rate', 'wann', 'fällig', 'rechnung kommt', 'abbuch'],
    answer: (s) => {
      const r = s.round
      if (!r) return { text: 'Du bist noch in keiner Runde.' }
      const p = per(r.intervalName)
      if (r.phase === 'bidding') return { text: `Die Bietphase läuft bis ${day(r.biddingEnd)}. Wird das Ziel erreicht, ist die erste Rate ab dann fällig, danach ${p.adj}, insgesamt ${r.installments}-mal.` }
      if (r.phase === 'running') {
        const text = r.canInvoice
          ? `Rate ${r.invoiceCount + 1} von ${r.installments} ist jetzt fällig. ${r.role === 'organizer' ? 'Du kannst die Rechnung stellen.' : 'Der Organisator stellt sie, du musst nichts tun: Der Betrag liegt schon im Contract.'}`
          : `Rate ${r.invoiceCount + 1} von ${r.installments} ist ab ${day(r.nextInvoiceAt)} fällig. Du musst nichts tun, der Betrag liegt schon im Contract.`
        return { text, actions: r.role === 'organizer' && r.canInvoice ? [{ type: 'invoice' }] : [] }
      }
      if (r.phase === 'completed') return { text: `Die Ratenzahlung ist abgeschlossen: ${r.invoiceCount} von ${r.installments} Raten wurden abgerechnet.` }
      return { text: 'Diese Runde hat ihr Ziel nicht erreicht. Es gibt keine Raten.' }
    }
  },
  receipt: {
    question: 'Wofür ist der Beleg?',
    keywords: ['beleg', 'quittung', 'nachweis', 'qr'],
    answer: (s) => {
      const r = s.round
      const paid = (r?.invoices || []).filter((x) => x.status === 'paid' && x.mine)
      return {
        text: 'Für jede abgerechnete Rate gibt es einen Beleg mit QR-Code. Der Anbieter prüft ihn direkt an der Blockchain, zum Beispiel bei der Abholung. Er beweist, dass dein Konto diese Rate bezahlt hat.' +
          (paid.length ? ` Du hast ${paid.length} ${paid.length === 1 ? 'Beleg' : 'Belege'}.` : ' Du hast noch keinen, der erste kommt mit der ersten Rechnung.'),
        actions: paid.length ? [{ type: 'receipt', index: paid.at(-1).index }] : []
      }
    }
  },
  fees: {
    question: 'Was kostet mich das?',
    keywords: ['kostet', 'gebühr', 'gebuehr', 'kosten', 'preis'],
    answer: (s) => ({
      text: 'Pomona selbst nimmt nichts. Für jede Transaktion fällt eine kleine Netzwerkgebühr an, die du in USDT bezahlst (auf Arbitrum meist ein paar Cent). Vor jedem Gebot siehst du die Gebühr, bevor du bestätigst. Einen anderen Token brauchst du nicht.'
    })
  },
  safety: {
    question: 'Ist mein Geld sicher?',
    keywords: ['sicher', 'betrug', 'vertrauen', 'risiko', 'weg'],
    answer: (s) => ({
      text: 'Das Geld liegt in einem Treuhand-Contract ohne Administrator. Der Organisator bekommt pro Rechnung nur eine Rate und höchstens einmal pro Intervall. Was nicht abgerechnet wird, geht an dich zurück. Dein Konto ist mit deinem Passwort verschlüsselt und läuft nur auf diesem Gerät. ' +
        'Ehrlich gesagt: Der Contract ist noch nicht extern geprüft. Diese Version ist ein Prototyp für Testnetze.'
    })
  },
  fund: {
    question: 'Wie lade ich mein Konto auf?',
    keywords: ['aufladen', 'einzahlen', 'guthaben', 'usdt bekommen', 'usdt kaufen', 'konto auf'],
    answer: (s) => ({
      text: `Du schickst USDT an deine Konto-Adresse, zum Beispiel von einer Börse. Wichtig: nur USDT, nur auf ${s.network?.name ?? 'dem richtigen Netzwerk'}, und nie an die Adresse einer Runde. Sobald das Geld ankommt, zeigt Pomona es an.`,
      actions: [{ type: 'open', page: 'fund' }]
    })
  },
  refund: {
    question: 'Wie bekomme ich mein Geld zurück?',
    keywords: ['zurück', 'erstatt', 'rückzahlung', 'auszahlen'],
    answer: (s) => {
      const r = s.round
      const amount = Number(r?.refundable)
      if (amount > 0) return { text: `Für dich liegen ${num(amount)} ${r.symbol} im Contract bereit. Ein Klick, und sie sind wieder in deinem Konto.`, actions: [{ type: 'refund' }] }
      if (r?.phase === 'bidding' && pledged(r)) return { text: `Während der Bietphase kannst du dein Gebot zurückziehen, dann kommen ${num(r.myDeposit)} ${r.symbol} sofort zurück.`, actions: [{ type: 'withdraw' }] }
      return { text: 'Geld zurück gibt es, wenn das Ziel verfehlt wird oder wenn Raten nicht mehr abgerechnet werden. Im Moment ist für dich nichts zurückzuholen.' }
    }
  },
  words: {
    question: 'Was sind die Notfall-Wörter?',
    keywords: ['notfall', 'wörter', 'woerter', 'seed', 'wiederherstell', 'passwort vergessen'],
    answer: () => ({
      text: 'Die 12 Notfall-Wörter sind der Generalschlüssel zu deinem Konto. Mit ihnen stellst du es auf einem neuen Gerät wieder her. Schreib sie auf Papier, gib sie niemandem, auch nicht mir oder dem Organisator. Pomona fragt nie danach.',
      actions: [{ type: 'open', page: 'wallet' }]
    })
  },
  status: {
    question: 'Wie steht die Runde?',
    keywords: ['stand', 'wie steht', 'überblick', 'zusammenfass'],
    answer: (s) => {
      const r = s.round
      if (!r) return { text: 'Du hast noch keine Runde. Starte eine oder tritt einer mit einem Link bei.' }
      const p = per(r.intervalName)
      const phase = { bidding: `Bietphase, ${until(r.biddingEnd, r.now)}`, running: `Ratenzahlung, ${r.invoiceCount} von ${r.installments} Raten abgerechnet`, completed: 'abgeschlossen', failed: 'Ziel nicht erreicht' }[r.phase]
      let text = `${r.bidders} ${r.bidders === 1 ? 'Gebot' : 'Gebote'}, zusammen ${num(r.total)} von ${num(r.target)} ${r.symbol} ${p.per} (${Math.round(r.progress * 100)} %). Phase: ${phase}.`
      if (pledged(r)) text += ` Du bietest ${num(r.myPledge)} ${r.symbol} ${p.per}.`
      return { text, actions: r.role === 'organizer' && r.canInvoice ? [{ type: 'invoice' }] : [] }
    }
  },
  invoice: {
    question: 'Wie stelle ich eine Rechnung?',
    keywords: ['rechnung stellen', 'abrechnen', 'rechnung'],
    answer: (s) => {
      const r = s.round
      if (r?.role !== 'organizer') return { text: 'Rechnungen stellt der Organisator. Du musst nichts tun: Deine Rate liegt schon im Contract, und du bekommst automatisch einen Beleg.' }
      if (r.canInvoice) return { text: `Rechnung ${r.invoiceCount + 1} ist fällig. Damit gehen ${num(r.total)} ${r.symbol} an dein Konto, und alle Bietenden bekommen ihren Beleg.`, actions: [{ type: 'invoice' }] }
      if (r.phase === 'running') return { text: `Die nächste Rechnung ist ab ${day(r.nextInvoiceAt)} möglich, höchstens eine pro Intervall.` }
      return { text: 'Rechnungen gibt es erst nach einer erfolgreichen Bietphase.' }
    }
  }
}

/** Topics that make sense for this person right now (for the suggestion buttons). */
export function suggestions (s) {
  const r = s?.round
  let ids
  if (!r) ids = ['how', 'fund', 'safety', 'fees']
  else if (r.role === 'organizer') ids = r.phase === 'running' ? ['status', 'invoice', 'next', 'safety'] : ['status', 'howmuch', 'failed', 'fees']
  else if (r.phase === 'bidding') ids = [pledged(r) ? 'change' : 'howmuch', 'how', 'failed', 'fees']
  else if (Number(r.refundable) > 0) ids = ['refund', 'status', 'receipt']
  else ids = ['next', 'receipt', 'status', 'safety']
  return ids.map((topic) => ({ topic, question: TOPICS[topic].question }))
}

/** @returns {Answer|null} */
export function answerTopic (topic, s) {
  return Object.hasOwn(TOPICS, topic) ? TOPICS[topic].answer(s) : null
}

/**
 * Finds the best matching topic for a free-text question by keywords, or null.
 * @param {string} text
 */
export function matchTopic (text) {
  const t = ' ' + String(text).toLowerCase() + ' '
  let best = null
  let score = 0
  for (const [id, topic] of Object.entries(TOPICS)) {
    const hits = topic.keywords.reduce((n, k) => n + (t.includes(k) ? k.length : 0), 0)
    if (hits > score) { best = id; score = hits }
  }
  return score >= 4 ? best : null
}

/** Background knowledge for the language model (compact, factual). */
export const FACTS = [
  'Pomona ist eine Bietrunde ohne Server: Organisator startet eine Runde, Bietende geben einen Betrag pro Rate an.',
  'Beim Bieten wird Betrag × Anzahl Raten im Treuhand-Contract hinterlegt. Der Organisator kann nicht vorab darauf zugreifen.',
  'Bis zum Ende der Bietphase kann man erhöhen oder zurückziehen; danach stehen die Gebote fest.',
  'Ziel erreicht: Der Organisator stellt höchstens einmal pro Intervall (Woche oder Monat) eine Rechnung, höchstens so oft wie Raten vereinbart sind. Jede Rechnung zahlt eine Rate aller Gebote aus.',
  'Ziel verfehlt oder Runde abgebrochen: alle bekommen ihren hinterlegten Betrag vollständig zurück.',
  'Endet die Ratenzahlung vorzeitig oder läuft der Zeitplan ab, bekommen die Bietenden die nicht abgerechneten Raten zurück.',
  'Für jede abgerechnete Rate gibt es einen Beleg mit QR-Code, den der Anbieter direkt an der Blockchain prüft.',
  'Bezahlt wird nur in USDT. Auch die Netzwerkgebühr wird in USDT bezahlt. USDT entspricht ungefähr einem US-Dollar, nicht einem Euro.',
  'Das Konto läuft nur auf diesem Gerät und ist mit einem Passwort verschlüsselt. Die 12 Notfall-Wörter darf man niemandem geben.',
  'Der Contract ist noch nicht extern geprüft; die App ist ein Prototyp für Testnetze.'
]
