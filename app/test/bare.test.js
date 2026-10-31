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

test('core runs in Bare (the Pear runtime)', async () => {
  const chain = await startChain()
  const storage = mkdtempSync(join(tmpdir(), 'pomona-bare-'))
  try {
    const local = { rpc: chain.url, ...(await deploy({ rpc: chain.url })) }
    const bare = join(require.resolve('bare-runtime/package'), '..', 'bin', 'bare')
    const out = await new Promise((resolve) => {
      let log = ''
      const p = spawn(bare, [new URL('./bare-smoke.js', import.meta.url).pathname, JSON.stringify({ storage, local })])
      p.stdout.on('data', (d) => { log += d })
      p.stderr.on('data', (d) => { log += d })
      p.on('exit', () => resolve(log))
    })
    const line = out.split('\n').find(l => l.startsWith('RESULT '))
    assert.ok(line, out)
    const r = JSON.parse(line.slice(7))
    assert.equal(r.title, 'Bare-Runde')
    assert.equal(r.total, '42.0')
    assert.equal(r.token, '4958.0')
  } finally {
    await chain.stop()
    rmSync(storage, { recursive: true, force: true })
  }
})
