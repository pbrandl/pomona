// Proves the core runs in Bare, the runtime of the Pear worker.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { startChain } from '../../contracts/scripts/devchain.js'
import { deploy } from '../../contracts/scripts/deploy.js'

const require = createRequire(import.meta.url)
const bare = join(require.resolve('bare-runtime/package'), '..', 'bin', 'bare')

test('core runs in Bare (Pear runtime): vault, WDK, Pears, contracts, ERC-4337', async () => {
  const chain = await startChain()
  const storage = mkdtempSync(join(tmpdir(), 'pomona-bare-'))
  try {
    const local = { rpc: chain.url, ...(await deploy({ rpc: chain.url })) }
    const out = await new Promise((resolve) => {
      let log = ''
      const p = spawn(bare, [new URL('./bare-smoke.js', import.meta.url).pathname, JSON.stringify({ storage, local })])
      p.stdout.on('data', (d) => { log += d })
      p.stderr.on('data', (d) => { log += d })
      p.on('exit', () => resolve(log))
    })
    const line = out.split('\n').find((l) => l.startsWith('RESULT '))
    assert.ok(line, out)
    const r = JSON.parse(line.slice(7))
    assert.equal(r.title, 'Bare-Runde')
    assert.equal(r.pledge, '42')
    assert.equal(r.deposit, '168')
    assert.equal(r.usdt, '4832')
    assert.match(r.smartAddress, /^0x[0-9a-fA-F]{40}$/)
  } finally {
    await chain.stop()
    rmSync(storage, { recursive: true, force: true })
  }
})
