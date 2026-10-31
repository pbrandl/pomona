// In-browser stand-in for the Bare worker, for design previews only
// (`npm run preview`). Pick a scenario with ?s=onboarding|start|bidder|organizer|succeeded|failed
const scenario = new URLSearchParams(location.search).get('s') || 'bidder'
const now = Math.floor(Date.now() / 1000)
const qr = (text) => { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) }

const link = 'pomona://eyJ2IjoxLCJtIjoiYTdmMGM5ZTQxYjJkNjhmMzBlNWE5Yzc0ZDFiOGUyZjZhMzBjOTRlN2IxZDVmMjhhNmMwZTNiOWQ0ZjdhMmUxYyIsIm4iOiJzZXBvbGlhIiwiciI6IjB4N2E0QjlmMDJjRTFkOEE2ZjMwRTU5YzdEMWI4RTJGNmEzMEM5NEU3YiIsImsiOiIweDNmLi4uIn0'

const round = (over = {}) => ({
  role: 'bidder', title: 'Solawi Lindenhof 2027', description: 'Gemüse für 40 Haushalte, April bis März. Jeder gibt, was er kann.',
  verified: true, address: '0x7a4B9f02cE1d8A6f30E59c7D1b8E2F6a30C94E7b', organizer: '0x1111111111111111111111111111111111111111',
  symbol: 'USDT', target: '48000', total: '31250', minBid: '25', progress: 31250 / 48000,
  deadline: now + 86400 * 12, now, state: 'open', claimed: false, inviteOnly: true, bidders: 27, myPledge: '0',
  news: [
    { text: 'Hofführung am Samstag um 14 Uhr – alle Bietenden sind herzlich eingeladen.', at: Date.now() - 3600e3 * 5 },
    { text: 'Willkommen zur Bietrunde 2027! Richtwert sind 100 USDT im Monat.', at: Date.now() - 86400e3 * 3 }
  ],
  ...over
})

const wallet = { address: '0x5C3e9A0bD41f7E28c6B9a3F1d02E8c7B4a6D9e10', native: '0.01845', token: '2400', symbol: 'USDT' }
const base = {
  network: { id: 'sepolia', name: 'Ethereum Sepolia', dev: false, native: 'ETH' },
  networks: [{ id: 'local', name: 'Lokal (Hardhat)', ready: true }, { id: 'sepolia', name: 'Ethereum Sepolia', ready: true }, { id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia', ready: false }],
  peers: 6, busy: null
}

const scenarios = {
  onboarding: { ...base, wallet: null, round: null },
  start: { ...base, wallet, round: null },
  bidder: { ...base, wallet, round: round({ myPledge: '1200' }) },
  organizer: { ...base, wallet, round: round({ role: 'organizer' }) },
  succeeded: { ...base, wallet, round: round({ role: 'organizer', state: 'succeeded', total: '49120', progress: 49120 / 48000, deadline: now - 3600, bidders: 41 }) },
  failed: { ...base, wallet, round: round({ state: 'failed', total: '22300', progress: 22300 / 48000, deadline: now - 3600, myPledge: '800' }) }
}
const state = structuredClone(scenarios[scenario])

window.pomona = {
  async call (method, params) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    switch (method) {
      case 'status': return structuredClone(state)
      case 'invite': return { link, qr: qr(link) }
      case 'qr': return qr(params.text)
      case 'revealSeed': return 'apfel birne wiese ernte korb sonne regen erde samen blüte frucht garten'
      case 'createWallet': state.wallet = wallet; return { address: wallet.address }
      case 'bid': {
        const r = state.round
        r.myPledge = String(Number(r.myPledge) + Number(params.amount))
        r.total = String(Number(r.total) + Number(params.amount))
        r.progress = Number(r.total) / Number(r.target)
        return null
      }
      default: return null
    }
  },
  on () {},
  copy () { return Promise.resolve() }
}
