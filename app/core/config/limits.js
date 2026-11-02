/**
 * Input limits. Everything that arrives from peers (manifest, news) or from the
 * UI is clamped to these sizes before it is stored or rendered.
 * @module core/config/limits
 */
export const LIMITS = Object.freeze({
  title: 120,
  description: 2000,
  website: 300,
  news: 1000,
  newsShown: 50,
  link: 2048,
  password: { min: 8, max: 256 },
  seed: 512,
  rpcLine: 64 * 1024,
  maxInstallments: 520,
  maxBiddingDays: 365
})
