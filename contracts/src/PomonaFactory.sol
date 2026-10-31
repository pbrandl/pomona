// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PomonaRound} from "./PomonaRound.sol";

/// @title Pomona factory and registry
/// @notice Deployed once per chain. Anyone can open a round; the caller becomes
///         its organizer. The registry (`isRound`) lets apps refuse to talk to
///         look-alike contracts from forged invite links.
contract PomonaFactory {
    /// @notice The token every round on this factory is settled in (USDT).
    IERC20 public immutable token;

    mapping(address => bool) public isRound;
    mapping(address => address[]) private _roundsOf;

    event RoundCreated(address indexed round, address indexed organizer);

    error BadToken();

    constructor(IERC20 token_) {
        if (address(token_).code.length == 0) revert BadToken();
        token = token_;
    }

    function createRound(
        uint256 target,
        uint256 minBid,
        uint64 biddingEnd,
        uint64 interval,
        uint32 installments,
        address inviteSigner
    ) external returns (PomonaRound round) {
        round = new PomonaRound(token, msg.sender, target, minBid, biddingEnd, interval, installments, inviteSigner);
        isRound[address(round)] = true;
        _roundsOf[msg.sender].push(address(round));
        emit RoundCreated(address(round), msg.sender);
    }

    /// @notice All rounds `organizer` created, oldest first.
    function roundsOf(address organizer) external view returns (address[] memory) {
        return _roundsOf[organizer];
    }
}
