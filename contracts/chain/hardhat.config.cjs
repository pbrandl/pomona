// Only used to run a local development chain (`npm run chain`).
// Contracts are compiled with solc-js via scripts/build.js, so no solc download is needed.
module.exports = {
  paths: { sources: './empty', cache: '../.hardhat-cache', artifacts: '../.hardhat-artifacts' },
  networks: { hardhat: { chainId: 31337, hardfork: 'cancun' } }
}
