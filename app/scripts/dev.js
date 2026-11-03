#!/usr/bin/env node
/**
 * Developer mode without Pear: `npm run dev`.
 *
 * Starts everything Pomona needs on this machine, without any outside network:
 *
 *   1. a local Hardhat chain with the real contracts and test USDT
 *   2. a local HyperDHT on loopback (replaces the public Holepunch DHT)
 *   3. one Bare worker per profile: the same core as in Pear (worker/dev.js)
 *   4. one HTTP server per profile on 127.0.0.1 that serves the UI
 *      (index.html with ui/dev.js instead of ui/electron.js) and relays RPC
 *
 * Two profiles by default, so one person can organize and another can bid.
 * Wallets and rounds live in a temporary folder and are gone after Ctrl+C,
 * just like the local chain. Models are read from ~/pomona-models.
 *
 * Options: --one (one profile), --no-open (do not open the browser),
 *          PORT=4180 (first port), POMONA_MODELS=/path (model folder),
 *          POMONA_MODELS_P2P=1 (allow the QVAC peer-to-peer download).
 *
 * See docs/DEV.md.
 */
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir, homedir, platform } from 'node:os'
import { join, extname, dirname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contracts = join(root, '..', 'contracts')
const require = createRequire(import.meta.url)
const args = new Set(process.argv.slice(2))

const PROFILES = args.has('--one') ? ['Anna'] : ['Anna', 'Ben']
const FIRST_PORT = Number(process.env.PORT || 4180)
const MODELS = process.env.POMONA_MODELS || join(homedir(), 'pomona-models')
const MAX_BODY = 64 * 1024
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' }
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: mediastream:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

const say = (...a) => console.log(...a)
const die = (msg) => { console.error('\n✗ ' + msg + '\n'); process.exit(1) }

// ------------------------------------------------------------------ checks

const major = Number(process.versions.node.split('.')[0])
if (major < 22) die(`Node.js 22 oder neuer nötig (gefunden: ${process.versions.node}).`)
if (!existsSync(join(root, 'node_modules'))) die('Bitte zuerst im Ordner app/ einmal `npm install` ausführen.')
if (!existsSync(join(contracts, 'node_modules'))) die('Bitte zuerst im Ordner contracts/ einmal `npm install` ausführen.')

let bare
try {
  bare = join(dirname(require.resolve('bare-runtime/package')), 'bin', 'bare')
} catch {
  die('bare-runtime fehlt. Bitte in app/ `npm install` ausführen (ohne --omit=dev).')
}

const { startChain } = await import('../../contracts/scripts/devchain.js')
const { deploy } = await import('../../contracts/scripts/deploy.js')
const { default: createTestnet } = await import('hyperdht/testnet.js')

// ------------------------------------------------------------------- start

say('\nPomona · Entwicklermodus (ohne Pear)\n')

say('· Contracts bauen …')
const built = spawnSync(process.execPath, [join(contracts, 'scripts', 'build.js')], { cwd: contracts, encoding: 'utf8' })
if (built.status !== 0) die('Contracts ließen sich nicht bauen:\n' + built.stdout + built.stderr)

say('· Lokale Chain starten …')
const chain = await startChain()
const addresses = await deploy({ rpc: chain.url })
const local = { rpc: chain.url, ...addresses }

say('· Lokales P2P-Netz starten …')
const testnet = await createTestnet(3, { host: '127.0.0.1' })

const storageRoot = mkdtempSync(join(tmpdir(), 'pomona-dev-'))
mkdirSync(MODELS, { recursive: true })

const servers = []
const workers = []
let stopping = false

async function stop (code = 0) {
  if (stopping) return
  stopping = true
  say('\nPomona wird beendet …')
  for (const w of workers) w.stop()
  for (const s of servers) s.close()
  await Promise.all(workers.map((w) => w.exited))
  await testnet.destroy().catch(() => {})
  await chain.stop().catch(() => {})
  rmSync(storageRoot, { recursive: true, force: true })
  process.exit(code)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

const profiles = []
for (let i = 0; i < PROFILES.length; i++) {
  const name = PROFILES[i]
  say(`· ${name}: Kern in Bare starten …`)
  const worker = startWorker(name, {
    storage: join(storageRoot, name.toLowerCase()),
    local,
    bootstrap: testnet.bootstrap,
    modelsDir: MODELS,
    modelsLocalOnly: process.env.POMONA_MODELS_P2P !== '1'
  })
  workers.push(worker)
  await worker.ready
  const token = randomBytes(24).toString('base64url')
  const port = await listen(name, worker, token, FIRST_PORT + i)
  profiles.push({ name, url: `http://127.0.0.1:${port}/#t=${token}` })
}

say('\n✓ Pomona läuft. Jedes Profil ist eine eigene Person mit eigener Wallet:\n')
for (const p of profiles) say(`  ${p.name.padEnd(5)} ${p.url}`)
say(`
  Modelle für „Frag Pomona“: ${MODELS}
  Alles ist eine Testumgebung und wird mit Ctrl+C gelöscht.
`)

if (!args.has('--no-open')) for (const p of profiles) openBrowser(p.url)

// ------------------------------------------------------------------ worker

/**
 * Starts worker/dev.js in Bare and speaks JSON lines over its stdin/stdout.
 * @returns {{ call: Function, onEvent: Function, ready: Promise<void>, stop: Function, exited: Promise<void> }}
 */
function startWorker (name, env) {
  const child = spawn(bare, [join(root, 'worker', 'dev.js'), JSON.stringify(env)], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  const listeners = new Set()
  let nextId = 1
  let buf = ''
  let log = ''
  let readyResolve, readyReject
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const exited = new Promise((resolve) => child.once('exit', resolve))

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.event === 'ready') readyResolve()
      if (msg.event) { for (const fn of listeners) fn(msg); continue }
      const p = pending.get(msg.id)
      if (p) { pending.delete(msg.id); p(msg) }
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (d) => {
    log = (log + d).slice(-8000)
    if (process.env.POMONA_DEBUG) process.stderr.write(d.replace(/^/gm, `[${name}] `))
  })
  child.once('exit', (code) => {
    for (const p of pending.values()) p({ error: { code: 'OFFLINE', message: 'Der Pomona-Kern wurde beendet.' } })
    pending.clear()
    readyReject(new Error(log))
    if (!stopping) {
      console.error(`\n✗ Kern von ${name} wurde beendet (Code ${code}):\n${log}`)
      stop(1)
    }
  })

  return {
    ready,
    exited,
    call (method, params) {
      const id = nextId++
      return new Promise((resolve) => {
        pending.set(id, resolve)
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
      })
    },
    onEvent (fn) { listeners.add(fn); return () => listeners.delete(fn) },
    stop () { child.stdin.end(); setTimeout(() => child.kill(), 3000).unref() }
  }
}

// -------------------------------------------------------------------- http

function sameToken (given, token) {
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Serves the UI and relays RPC for one profile. Listens on loopback only. */
function listen (name, worker, token, port) {
  const server = createServer(async (req, res) => {
    const host = req.headers.host || ''
    const url = new URL(req.url, 'http://x')
    const headers = { 'content-security-policy': CSP, 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' }
    // DNS rebinding: a foreign site resolving to 127.0.0.1 would send its own Host.
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return res.writeHead(403, headers).end()

    if (url.pathname === '/rpc') {
      // A custom header forces a CORS preflight that we never answer: other origins cannot call.
      if (req.method !== 'POST' || !sameToken(req.headers['x-pomona-token'], token)) return res.writeHead(403, headers).end()
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (body.length > MAX_BODY) return res.writeHead(413, headers).end()
      }
      let msg
      try { msg = JSON.parse(body) } catch { return res.writeHead(400, headers).end() }
      if (!msg || typeof msg.method !== 'string') return res.writeHead(400, headers).end()
      const reply = await worker.call(msg.method, msg.params ?? {})
      return res.writeHead(200, { ...headers, 'content-type': 'application/json' }).end(JSON.stringify({ result: reply.result ?? null, error: reply.error }))
    }

    if (url.pathname === '/events') {
      if (!sameToken(url.searchParams.get('t'), token)) return res.writeHead(403, headers).end()
      res.writeHead(200, { ...headers, 'content-type': 'text/event-stream', connection: 'keep-alive' })
      res.write(': ok\n\n')
      const off = worker.onEvent((msg) => res.write('data: ' + JSON.stringify(msg) + '\n\n'))
      const ping = setInterval(() => res.write(': ping\n\n'), 20000)
      req.on('close', () => { off(); clearInterval(ping) })
      return
    }

    if (req.method !== 'GET') return res.writeHead(405, headers).end()
    const path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
    const file = normalize(join(root, path))
    // Only the page and the UI folder are served, never the core or the worker.
    if (path !== '/index.html' && !file.startsWith(join(root, 'ui') + sep)) return res.writeHead(404, headers).end()
    try {
      let body = await readFile(file)
      if (path === '/index.html') {
        body = body.toString('utf8')
          .replace('./ui/electron.js', './ui/dev.js')
          .replace('<title>Pomona</title>', `<title>Pomona · ${name}</title>`)
      }
      res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404, headers).end()
    }
  })
  servers.push(server)
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code !== 'EADDRINUSE') return reject(e)
      server.listen(0, '127.0.0.1') // port taken: let the OS pick one
    })
    server.listen(port, '127.0.0.1', () => resolve(server.address().port))
  })
}

function openBrowser (url) {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open'
  const argv = platform() === 'win32' ? ['/c', 'start', '', url] : [url]
  try { spawn(cmd, argv, { stdio: 'ignore', detached: true }).on('error', () => {}).unref() } catch {}
}
