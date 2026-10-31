// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PomonaRound} from "./PomonaRound.sol";

/// @title Pomona factory
/// @notice Deployed once per chain. Anyone can open a round; the caller becomes
///         its organizer.
contract PomonaFactory {
    event RoundCreated(address indexed round, address indexed organizer, address indexed token);

    function createRound(
        IERC20 token,
        uint256 target,
        uint64 deadline,
        uint256 minBid,
        address inviteSigner
    ) external returns (PomonaRound round) {
        round = new PomonaRound(token, msg.sender, target, deadline, minBid, inviteSigner);
        emit RoundCreated(address(round), msg.sender, address(token));
    }
}
