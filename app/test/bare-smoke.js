// Runs under Bare (spawned by bare.test.js): the same core the Pear worker uses.
import { Pomona, QvacEngine } from '../core/bare.js'
import { SmartAccount } from '../core/wallet/smart-account.js' with { imports: 'bare-node-runtime/imports' }
import { pomonaPolicy } from '../core/wallet/policy.js' with { imports: 'bare-node-runtime/imports' }

const env = JSON.parse(Bare.argv[Bare.argv.length - 1])
const app = new Pomona({ storage: env.storage, allowDev: true, defaultNetwork: 'local', networkOverrides: { local: env.local }, pollMs: 60000 })
try {
  await app.ready()
  const { seed } = await app.createWallet({ password: 'birnenbaum-2027' }) // Argon2id vault in Bare
  await app.faucet()
  await app.createRound({ title: 'Bare-Runde', target: '100', interval: 'week', installments: 4, biddingDays: 1, inviteOnly: true })
  await app.bid({ amount: '42' })
  const inv = app.invite()
  if (!inv.qr.startsWith('<svg')) throw new Error('qr')
  const s = await app.status()

  // ERC-4337 smart account (WDK) loads in Bare and derives its Safe address offline.
  const fake = '0x0000000000000000000000000000000000000001'
  const smart = new SmartAccount({
    seed,
    net: { chainId: 11155111, token: fake, aa: { bundlerUrl: 'http://127.0.0.1:1', paymasterUrl: 'http://127.0.0.1:1', paymasterAddress: fake, safeModulesVersion: '0.3.0' } },
    provider: 'http://127.0.0.1:1',
    policy: pomonaPolicy({ token: () => fake, factory: () => fake, round: () => null })
  })
  const smartAddress = await smart.address()
  smart.dispose()

  // QVAC (Tether's local AI) loads in Bare: config, plugin, model registry.
  const engine = new QvacEngine({ cacheDir: env.storage + '/models' })
  const qvac = await engine._api()
  const qvacReady = typeof qvac.completion === 'function' && !!qvac.models.QWEN3_1_7B_INST_Q4
  await engine.close()
  const answer = await app.assistantAsk({ topic: 'howmuch' })

  console.log('RESULT ' + JSON.stringify({ title: s.round.title, pledge: s.round.myPledge, deposit: s.round.myDeposit, usdt: s.wallet.usdt, smartAddress, qvacReady, answer: answer.reply.slice(0, 40) }))
} catch (e) {
  console.log('ERROR ' + (e.stack || e))
} finally {
  await app.close()
}
