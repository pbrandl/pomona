// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test stand-in for USDT: 6 decimals and a public faucet.
///         Deployed only on the local chain and testnets, never on mainnet.
contract MockUSDT is ERC20 {
    constructor() ERC20("Tether USD (Test)", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
