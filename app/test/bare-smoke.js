// Runs under Bare (spawned by bare.test.js): wallet + round creation end to end.
import { Pomona } from '../core/bare.js'

const env = JSON.parse(Bare.argv[Bare.argv.length - 1])
const app = new Pomona({ storage: env.storage, defaultNetwork: 'local', networkOverrides: { local: env.local }, pollMs: 60000 })
try {
  await app.ready()
  await app.createWallet()
  await app.faucet()
  const { link } = await app.createRound({ title: 'Bare-Runde', target: '100', days: 1, inviteOnly: true })
  await app.bid('42')
  const inv = app.invite()
  if (!inv.qr.startsWith('<svg')) throw new Error('qr')
  const s = await app.status()
  console.log('RESULT ' + JSON.stringify({ link, total: s.round.total, token: s.wallet.token, title: s.round.title }))
} catch (e) {
  console.log('ERROR ' + (e.stack || e))
} finally {
  await app.close()
}
