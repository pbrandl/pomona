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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startChain({ port: Number(process.env.PORT ?? 8545) })
  console.log('dev chain running at', url)
}
