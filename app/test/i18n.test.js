// Every language has the same keys, plurals and placeholders as German.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGES, FALLBACK, t, setLanguage } from '../i18n/index.js'

/** key → shape: 'string {a,b}', 'list', 'plural {n}' (word lists may differ in length) */
function shapes (v, path = '', out = new Map()) {
  const holes = (s) => '{' + [...new Set(String(s).match(/\{\w+\}/g) || [])].sort().join(',') + '}'
  if (typeof v === 'string') out.set(path, 'string ' + holes(v))
  else if (Array.isArray(v)) out.set(path, path.endsWith('months') ? 'list ' + v.length : 'list')
  else if (v && typeof v === 'object' && 'other' in v) out.set(path, 'plural ' + holes(v.one + v.other))
  else for (const [k, w] of Object.entries(v)) shapes(w, path ? path + '.' + k : k, out)
  return out
}

const reference = shapes(LANGUAGES[FALLBACK].catalog)

for (const [lang, { catalog }] of Object.entries(LANGUAGES)) {
  if (lang === FALLBACK) continue
  test(`i18n: ${lang} has the same keys and placeholders as ${FALLBACK}`, () => {
    const mine = shapes(catalog)
    const missing = [...reference.keys()].filter((k) => !mine.has(k))
    const extra = [...mine.keys()].filter((k) => !reference.has(k))
    const differ = [...reference.keys()].filter((k) => mine.has(k) && mine.get(k) !== reference.get(k)).map((k) => `${k}: ${reference.get(k)} ≠ ${mine.get(k)}`)
    assert.deepEqual({ missing, extra, differ }, { missing: [], extra: [], differ: [] })
  })
  test(`i18n: ${lang} command patterns compile`, () => {
    for (const src of Object.values(catalog.agent.match)) assert.doesNotThrow(() => new RegExp(src))
  })
}

test('i18n: t() fills placeholders, plurals, falls back to the key', () => {
  setLanguage('es-MX')
  assert.equal(t('err.installments', { max: 24 }), 'Número de facturas: de 1 a 24.')
  assert.equal(t('agent.topic.receipt.count', { n: 1 }), 'Tienes 1 comprobante.')
  assert.equal(t('nope.nothing'), 'nope.nothing')
  setLanguage('fr')
  assert.equal(t('err.noRound'), 'Noch keine Runde.')
})
