// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Pomona bidding round (assurance contract)
/// @notice Bidders lock tokens while the round is open. After the deadline the
///         organizer can claim everything if the target was reached; otherwise
///         every bidder takes their pledge back. There are no admin keys.
contract PomonaRound is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Open,
        Succeeded,
        Failed
    }

    IERC20 public immutable token;
    address public immutable organizer;
    uint256 public immutable target;
    uint64 public immutable deadline;
    uint256 public immutable minBid;
    /// @notice If non-zero, a bidder's first bid must carry a signature by this
    ///         key. Its private key travels inside the invite link, so only
    ///         people holding the link can bid (anti-spam).
    address public immutable inviteSigner;

    uint256 public total;
    uint256 public bidderCount;
    bool public claimed;
    bool public cancelled;
    mapping(address => uint256) public pledgeOf;

    event Bid(address indexed bidder, uint256 amount, uint256 pledge, uint256 total);
    event Withdrawn(address indexed bidder, uint256 amount, uint256 pledge, uint256 total);
    event Claimed(address indexed organizer, uint256 amount);
    event Refunded(address indexed bidder, uint256 amount);
    event Cancelled();

    error NotOpen();
    error NotOrganizer();
    error ZeroAmount();
    error BelowMinBid();
    error InvalidInvite();
    error TooMuch();
    error NotSucceeded();
    error NotFailed();
    error AlreadyClaimed();
    error NothingToRefund();
    error BadParams();

    constructor(
        IERC20 token_,
        address organizer_,
        uint256 target_,
        uint64 deadline_,
        uint256 minBid_,
        address inviteSigner_
    ) {
        if (address(token_) == address(0) || organizer_ == address(0)) revert BadParams();
        if (target_ == 0 || deadline_ <= block.timestamp) revert BadParams();
        token = token_;
        organizer = organizer_;
        target = target_;
        deadline = deadline_;
        minBid = minBid_;
        inviteSigner = inviteSigner_;
    }

    // ------------------------------------------------------------------ views

    function state() public view returns (State) {
        if (claimed) return State.Succeeded;
        if (cancelled) return State.Failed;
        if (block.timestamp < deadline) return State.Open;
        return total >= target ? State.Succeeded : State.Failed;
    }

    /// @notice The digest an invite key signs (EIP-191) to admit `bidder`.
    function inviteDigest(address bidder) public view returns (bytes32) {
        return keccak256(abi.encodePacked("pomona:invite", block.chainid, address(this), bidder));
    }

    /// @notice Everything the app needs in one call.
    function info()
        external
        view
        returns (
            address token_,
            address organizer_,
            uint256 target_,
            uint64 deadline_,
            uint256 minBid_,
            address inviteSigner_,
            uint256 total_,
            uint256 bidderCount_,
            State state_,
            bool claimed_
        )
    {
        return (
            address(token), organizer, target, deadline, minBid, inviteSigner,
            total, bidderCount, state(), claimed
        );
    }

    // ---------------------------------------------------------------- bidders

    /// @notice Place a bid or raise an existing one. Requires prior `approve`.
    /// @param invite Signature by `inviteSigner`; only checked on the first bid.
    function bid(uint256 amount, bytes calldata invite) external nonReentrant {
        if (state() != State.Open) revert NotOpen();
        if (amount == 0) revert ZeroAmount();

        uint256 previous = pledgeOf[msg.sender];
        if (previous == 0 && inviteSigner != address(0)) {
            bytes32 digest = MessageHashUtils.toEthSignedMessageHash(inviteDigest(msg.sender));
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, invite);
            if (err != ECDSA.RecoverError.NoError || signer != inviteSigner) revert InvalidInvite();
        }

        // Account for what actually arrived (fee-on-transfer safe).
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;

        uint256 pledge = previous + received;
        if (pledge < minBid) revert BelowMinBid();
        if (previous == 0) bidderCount++;
        pledgeOf[msg.sender] = pledge;
        total += received;

        emit Bid(msg.sender, received, pledge, total);
    }

    /// @notice Lower or withdraw a bid while the round is open.
    function withdraw(uint256 amount) external nonReentrant {
        if (state() != State.Open) revert NotOpen();
        if (amount == 0) revert ZeroAmount();
        uint256 previous = pledgeOf[msg.sender];
        if (amount > previous) revert TooMuch();

        uint256 pledge = previous - amount;
        if (pledge != 0 && pledge < minBid) revert BelowMinBid();
        if (pledge == 0) bidderCount--;
        pledgeOf[msg.sender] = pledge;
        total -= amount;

        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, pledge, total);
    }

    /// @notice Take the pledge back after a failed or cancelled round.
    function refund() external nonReentrant {
        if (state() != State.Failed) revert NotFailed();
        uint256 amount = pledgeOf[msg.sender];
        if (amount == 0) revert NothingToRefund();
        pledgeOf[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    // -------------------------------------------------------------- organizer

    /// @notice Pay out the round after the deadline if the target was reached.
    function claim() external nonReentrant {
        if (msg.sender != organizer) revert NotOrganizer();
        if (claimed) revert AlreadyClaimed();
        if (state() != State.Succeeded) revert NotSucceeded();
        claimed = true;
        uint256 amount = total;
        token.safeTransfer(organizer, amount);
        emit Claimed(organizer, amount);
    }

    /// @notice Abort an open round; every bidder can then refund.
    function cancel() external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (state() != State.Open) revert NotOpen();
        cancelled = true;
        emit Cancelled();
    }
}
