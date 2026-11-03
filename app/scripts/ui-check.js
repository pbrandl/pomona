// UI check: proves that a change to the UI (CSS, views, app.js) changes only
// what it should. It walks every view of the design preview – all scenarios of
// ui/mock.js, every page you can open from them, the bid and pay flows, the
// chat – on four screens (iPhone 13, iPhone SE, dark mode, desktop) and records
// for every element its position, size, text and computed style.
//
//   npm run ui-check               compare with the baseline (records one if missing)
//   npm run ui-check -- --baseline record the baseline anew (after an intended change)
//   npm run ui-check -- --only phone   one screen only (phone, small, dark, desk)
//
// Typical use: record the baseline before a refactoring, check after it.
// "Verschoben" and "Text" are visible changes; "Nur berechnete Styles" (e.g.
// gap 0px → normal on a flex item) usually has no visible effect.
// Needs Playwright with Chromium (see docs/DEV.md). Results in app/.ui-check/.
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, '.ui-check')
const args = process.argv.slice(2)
const record = args.includes('--baseline')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

let playwright
try {
  playwright = await import('playwright')
} catch {
  console.error('Playwright fehlt: im Ordner app/ `npm install` und einmal `npx playwright install chromium` ausführen.')
  process.exit(2)
}
const { chromium, devices } = playwright

const SCENARIOS = ['onboarding', 'locked', 'start', 'fund', 'newbidder', 'bidder', 'organizer', 'invoice', 'receipts', 'completed', 'payg-bidding', 'payg', 'payg-organizer', 'failed']
const SCREENS = {
  phone: { ...devices['iPhone 13'] },
  small: { ...devices['iPhone SE'] },
  dark: { ...devices['iPhone 13'], colorScheme: 'dark' },
  desk: { viewport: { width: 1280, height: 800 } }
}
/** Buttons on a main view that open a page or change the view. */
const OPENERS = ['open-sheet', 'start-bid', 'open-pay', 'show-invoice', 'show-receipt', 'open-assistant', 'open-fund', 'create-wallet-start', 'open-create', 'invoice', 'toggle-news', 'refund', 'withdraw']
const PROPS = ['display', 'position', 'top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-bottom-style', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
  'border-top-left-radius', 'border-bottom-right-radius', 'background-color', 'background-image', 'color', 'font-size', 'font-weight', 'font-family',
  'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration-line', 'text-transform', 'white-space', 'opacity', 'box-shadow', 'transform',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self', 'align-content', 'justify-content', 'justify-items',
  'justify-self', 'grid-template-columns', 'grid-template-rows', 'row-gap', 'column-gap', 'overflow-x', 'overflow-y', 'z-index', 'visibility', 'mask-image',
  'animation-name', 'max-width', 'min-width', 'max-height', 'min-height', 'aspect-ratio', 'cursor', 'pointer-events', 'outline-style', 'text-overflow',
  'vertical-align', 'list-style-type', 'fill', 'stroke', 'stroke-width', 'object-fit', 'scrollbar-width', 'overscroll-behavior-y', 'touch-action',
  'font-variant-numeric', 'text-wrap-style', 'content', 'height', 'width', 'caret-color', 'filter', 'stroke-dasharray', 'stroke-dashoffset']
// Animations and transitions finish at once, the caret does not blink: the same page gives the same numbers.
const FREEZE = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}'

// ------------------------------------------------------------------ preview

async function freePort () {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
  })
}

async function startPreview () {
  const port = await freePort()
  const child = spawn(process.execPath, [join(root, 'scripts', 'preview.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  const base = `http://localhost:${port}/preview.html`
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) return { base, stop: () => child.kill() } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  child.kill()
  throw new Error('Die Vorschau startet nicht (scripts/preview.js).')
}

// ------------------------------------------------------------------ capture

async function capture (page) {
  await page.waitForTimeout(250)
  await page.waitForFunction(() => !document.querySelector('.verify.pending, .spinner'), null, { timeout: 4000 }).catch(() => {})
  return page.evaluate((PROPS) => {
    const pick = (cs) => PROPS.map((k) => cs.getPropertyValue(k)).join('|')
    const els = []
    for (const el of [document.documentElement, document.body, ...document.querySelectorAll('#app *')]) {
      const r = el.getBoundingClientRect()
      const cls = el.getAttribute('class')
      const row = {
        id: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.trim().split(/\s+/).join('.') : ''),
        box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','),
        css: pick(window.getComputedStyle(el))
      }
      for (const ps of ['::before', '::after']) {
        const c = window.getComputedStyle(el, ps)
        if (c.content && c.content !== 'none' && c.content !== 'normal') row[ps] = pick(c)
      }
      if (!el.children.length && el.textContent.trim()) row.text = el.textContent.trim().slice(0, 200)
      els.push(row)
    }
    return { page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], els }
  }, PROPS)
}

/** Walks all views on one screen and writes one JSON file per view. */
async function walk (browser, base, screen, dir) {
  const ctx = await browser.newContext(SCREENS[screen])
  await ctx.addInitScript((css) => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s)
  }), FREEZE)
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00Z'))
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.dismiss())
  mkdirSync(dir, { recursive: true })
  let count = 0
  const save = async (name) => { writeFileSync(join(dir, name + '.json'), JSON.stringify(await capture(page))); count++ }
  const load = async (s, extra = '') => { await page.goto(`${base}?s=${s}${extra}`); await page.waitForSelector('#app > *'); await page.waitForTimeout(700) }
  const tap = async (sel) => {
    const el = page.locator(sel).first()
    if (!(await el.count())) return false
    await el.click()
    await page.waitForTimeout(450)
    return true
  }

  for (const s of SCENARIOS) {
    await load(s)
    await save(s)
    const openers = await page.evaluate((OPENERS) => {
      const seen = new Set()
      const list = []
      for (const el of document.querySelectorAll('[data-action]')) {
        const a = el.dataset.action
        if (!OPENERS.includes(a)) continue
        const key = [a, el.dataset.sheet, el.dataset.index].filter(Boolean).join('-')
        if (seen.has(key)) continue
        seen.add(key)
        list.push({ key, sel: `[data-action="${a}"]` + (el.dataset.sheet ? `[data-sheet="${el.dataset.sheet}"]` : '') + (el.dataset.index ? `[data-index="${el.dataset.index}"]` : '') })
      }
      return list
    }, OPENERS)
    for (const o of openers) {
      await load(s)
      if (await tap(o.sel)) await save(`${s}__${o.key}`)
    }
    // bid: amount → review → done
    await load(s)
    if (await tap('[data-action="start-bid"]')) {
      if (await page.locator('[data-key="5"]').count()) { await tap('[data-key="5"]'); await tap('[data-key="0"]') } else if (await page.locator('#amount').count()) await page.fill('#amount', '50')
      await save(`${s}__bid-amount`)
      if (await tap('[data-action="review-bid"]')) {
        await save(`${s}__bid-review`)
        if (await tap('[data-action="confirm-bid"]')) { await page.waitForTimeout(3500); await save(`${s}__bid-done`) }
      }
    }
    // pay: review → done
    await load(s)
    if (await tap('[data-action="open-pay"]')) {
      await save(`${s}__pay-review`)
      if (await tap('[data-action="confirm-pay"]')) { await page.waitForTimeout(3500); await save(`${s}__pay-done`) }
    }
    // chat page with an answer
    await load(s)
    if (await tap('[data-action="open-assistant"]') && await tap('[data-action="agent-topic"]')) { await page.waitForTimeout(1500); await save(`${s}__chat-answer`) }
    // the start screen's chat
    await load(s)
    if (await page.locator('.home-dock #ask').count()) {
      await page.locator('#ask').click()
      await page.waitForTimeout(600)
      await save(`${s}__home-chat`)
      if (await tap('[data-action="agent-topic"]')) { await page.waitForTimeout(1500); await save(`${s}__home-answer`) }
    }
  }
  for (const extra of ['ready', 'manual']) {
    await load('bidder', `&ai=${extra}`)
    if (await tap('[data-action="open-assistant"]')) await save(`bidder__assistant-${extra}`)
  }
  await ctx.close()
  return { count, errors }
}

// ------------------------------------------------------------------ compare

function compare (a, b, screens) {
  const out = { missing: [], added: [], moved: [], text: [], structure: [], props: new Map() }
  const views = (d) => screens.filter((s) => existsSync(join(d, s))).flatMap((s) => readdirSync(join(d, s)).map((f) => `${s}/${f}`))
  const inB = new Set(views(b))
  for (const v of views(a)) {
    if (!inB.has(v)) { out.missing.push(v); continue }
    inB.delete(v)
    const x = JSON.parse(readFileSync(join(a, v)))
    const y = JSON.parse(readFileSync(join(b, v)))
    const name = v.replace(/\.json$/, '')
    if (x.page.join() !== y.page.join()) out.moved.push(`${name}: page ${x.page} → ${y.page}`)
    if (x.els.length !== y.els.length || x.els.some((e, i) => e.id !== y.els[i].id)) {
      const i = x.els.findIndex((e, j) => e.id !== y.els[j]?.id)
      out.structure.push(`${name}: ${x.els.length} → ${y.els.length} elements, first difference ${x.els[i]?.id ?? '–'} → ${y.els[i]?.id ?? '–'}`)
      continue
    }
    x.els.forEach((e, i) => {
      const f = y.els[i]
      if (e.box !== f.box) out.moved.push(`${name}: ${e.id} ${e.box} → ${f.box}`)
      if (e.text !== f.text) out.text.push(`${name}: ${e.id} "${e.text}" → "${f.text}"`)
      for (const k of ['css', '::before', '::after']) {
        if (e[k] === f[k]) continue
        const p = (e[k] || '').split('|')
        const q = (f[k] || '').split('|')
        PROPS.forEach((prop, j) => {
          if (p[j] === q[j]) return
          const key = `${e.id.split('.').slice(0, 2).join('.')}${k === 'css' ? '' : k} ${prop}: ${p[j] ?? '–'} → ${q[j] ?? '–'}`
          out.props.set(key, (out.props.get(key) || 0) + 1)
        })
      }
    })
  }
  out.added = [...inB]
  return out
}

function report (d) {
  const list = (title, items, n = 12) => {
    if (!items.length) return
    console.log(`\n${title} (${items.length})`)
    for (const it of items.slice(0, n)) console.log('  ' + it)
    if (items.length > n) console.log(`  … und ${items.length - n} weitere`)
  }
  list('Nur in der Baseline', d.missing)
  list('Neue Ansichten', d.added)
  list('Andere Elemente (Struktur)', d.structure)
  list('Verschoben oder andere Größe', d.moved)
  list('Text', d.text)
  list('Nur berechnete Styles', [...d.props].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${String(n).padStart(4)}× ${k}`), 20)
  return d.missing.length + d.added.length + d.structure.length + d.moved.length + d.text.length + d.props.size
}

// ------------------------------------------------------------------ main

const baseline = join(OUT, 'baseline')
const target = record || !existsSync(baseline) ? baseline : join(OUT, 'current')
const screens = Object.keys(SCREENS).filter((s) => !only || s === only)
rmSync(target, { recursive: true, force: true })
const preview = await startPreview()
const browser = await chromium.launch()
try {
  const t0 = Date.now()
  const results = await Promise.all(screens.map((s) => walk(browser, preview.base, s, join(target, s))))
  const count = results.reduce((n, r) => n + r.count, 0)
  const errors = results.flatMap((r) => r.errors)
  console.log(`${count} Ansichten auf ${screens.join(', ')} in ${Math.round((Date.now() - t0) / 1000)} s`)
  if (errors.length) { console.log('Fehler auf der Seite:\n  ' + [...new Set(errors)].join('\n  ')); process.exitCode = 1 }
  if (target === baseline) {
    console.log(`Baseline gespeichert (${baseline}). Jetzt ändern, danach erneut \`npm run ui-check\`.`)
  } else {
    const n = report(compare(baseline, target, screens))
    console.log(n ? '\nUnterschiede gefunden (siehe oben).' : '\nKeine Unterschiede: Jede Ansicht sieht aus wie in der Baseline.')
    if (n) process.exitCode = 1
  }
} finally {
  await browser.close()
  preview.stop()
}
