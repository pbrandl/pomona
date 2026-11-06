// Starts a local Hardhat node (in-memory EVM) as a child process.
// Used by the tests here and in ../app, and by `npm run chain` for demos.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createServer } from 'node:net'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'chain')

export async function freePort () {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

export async function startChain ({ port } = {}) {
  port = port ?? await freePort()
  const cli = join(dir, '..', 'node_modules', 'hardhat', 'internal', 'cli', 'cli.js')
  const child = spawn(process.execPath, [cli, 'node', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: dir, stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise((resolve, reject) => {
    let log = ''
    const onData = (d) => {
      log += d
      if (log.includes('Started HTTP')) resolve()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', (code) => reject(new Error('hardhat node exited ' + code + '\n' + log)))
  })
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', resolve)
      child.kill()
    })
  }
}

/** Is there already an Ethereum node answering on this port? */
async function chainAt (url) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) })
    return (await res.json()).result ?? null
  } catch { return null }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8545)
  const url = `http://127.0.0.1:${port}`
  if (await chainAt(url)) {
    console.log(`Die Dev-Chain läuft schon auf ${url}. Nichts zu tun; \`npm start\` in app/ nutzt sie.`)
    console.log(`Neu starten: alte Chain beenden (lsof -ti tcp:${port} | xargs kill), dann erneut \`npm run chain\`.`)
    process.exit(0)
  }
  try {
    await startChain({ port })
  } catch (e) {
    if (!/EADDRINUSE/.test(e.message)) throw e
    console.error(`Port ${port} ist belegt, aber nicht von einer Chain. Welches Programm: lsof -i tcp:${port}`)
    process.exit(1)
  }
  console.log('dev chain running at', url)
}
