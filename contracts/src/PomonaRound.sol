// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Pomona bidding round with installment invoicing
/// @author Pomona
/// @notice One bidding round of a community-supported project, settled in USDT.
///
///         A bid is an amount *per installment*. While bidding is open, a bidder
///         deposits `bid * installments` into this contract (escrow). After the
///         bidding deadline:
///
///         - target missed (sum of bids per installment < target): every bidder
///           takes the full deposit back (`refund`).
///         - target reached: the organizer may issue one invoice per interval,
///           at most `installments` times. Each invoice releases one installment
///           of every bid to the organizer. Bidders keep a verifiable receipt
///           (`receipt`). Whatever is not invoiced by the end of the schedule,
///           or after the organizer terminates the round, goes back to the
///           bidders.
///
///         There are no admin keys and no upgrade path. See docs/CONTRACT.md.
contract PomonaRound is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Lifecycle of a round. Derived from time and state, never stored.
    enum Phase {
        Bidding, //   accepting, raising and withdrawing bids
        Failed, //    cancelled or target missed: full refunds
        Running, //   target reached: organizer invoices installment by installment
        Completed //  schedule over, all invoiced or terminated: refunds of the rest
    }

    /// @notice Everything the app shows, in one call.
    struct Info {
        address token;
        address organizer;
        uint256 target;
        uint256 minBid;
        uint64 biddingEnd;
        uint64 interval;
        uint32 installments;
        address inviteSigner;
        uint256 total;
        uint32 bidderCount;
        uint32 invoiceCount;
        uint64 nextInvoiceAt;
        uint64 expiresAt;
        Phase phase;
    }

    uint32 public constant MAX_INSTALLMENTS = 520; // 10 years of weekly invoices
    uint64 public constant MIN_INTERVAL = 1 days;
    uint64 public constant MAX_INTERVAL = 366 days;

    IERC20 public immutable token;
    address public immutable organizer;
    /// @notice Target per installment, in token base units.
    uint256 public immutable target;
    /// @notice Minimum bid per installment, in token base units.
    uint256 public immutable minBid;
    /// @notice End of the bidding phase; also the due date of the first invoice.
    uint64 public immutable biddingEnd;
    /// @notice Seconds between two invoices (e.g. 7 days or 30 days).
    uint64 public immutable interval;
    /// @notice How often the organizer may invoice.
    uint32 public immutable installments;
    /// @notice If non-zero, a bidder's first bid must carry a signature by this
    ///         key. Its private key travels in the invite link (anti-spam).
    address public immutable inviteSigner;

    /// @notice Sum of all bids per installment.
    uint256 public total;
    uint32 public bidderCount;
    uint32 public invoiceCount;
    bool public cancelled;
    bool public terminated;
    /// @notice Bid per installment of each bidder. Frozen once bidding ends.
    mapping(address => uint256) public pledgeOf;
    mapping(address => bool) public refunded;
    mapping(uint256 => uint64) public invoicedAt;

    event Bid(address indexed bidder, uint256 amount, uint256 pledge, uint256 total);
    event Withdrawn(address indexed bidder, uint256 amount, uint256 pledge, uint256 total);
    event Invoiced(uint256 indexed index, uint256 amount, uint64 at);
    event Refunded(address indexed bidder, uint256 amount);
    event Cancelled();
    event Terminated(uint32 invoiceCount);

    error BadParams();
    error WrongPhase();
    error NotOrganizer();
    error ZeroAmount();
    error BelowMinBid();
    error InvalidInvite();
    error TooMuch();
    error NotDue();
    error NothingToRefund();
    error UnsupportedToken();

    constructor(
        IERC20 token_,
        address organizer_,
        uint256 target_,
        uint256 minBid_,
        uint64 biddingEnd_,
        uint64 interval_,
        uint32 installments_,
        address inviteSigner_
    ) {
        if (address(token_).code.length == 0 || organizer_ == address(0)) revert BadParams();
        if (target_ == 0 || biddingEnd_ <= block.timestamp) revert BadParams();
        if (interval_ < MIN_INTERVAL || interval_ > MAX_INTERVAL) revert BadParams();
        if (installments_ == 0 || installments_ > MAX_INSTALLMENTS) revert BadParams();
        token = token_;
        organizer = organizer_;
        target = target_;
        minBid = minBid_;
        biddingEnd = biddingEnd_;
        interval = interval_;
        installments = installments_;
        inviteSigner = inviteSigner_;
    }

    modifier onlyOrganizer() {
        if (msg.sender != organizer) revert NotOrganizer();
        _;
    }

    modifier inPhase(Phase p) {
        if (phase() != p) revert WrongPhase();
        _;
    }

    // ------------------------------------------------------------------ views

    function phase() public view returns (Phase) {
        if (cancelled) return Phase.Failed;
        if (block.timestamp < biddingEnd) return Phase.Bidding;
        if (total < target) return Phase.Failed;
        if (terminated || invoiceCount == installments || block.timestamp >= expiresAt()) return Phase.Completed;
        return Phase.Running;
    }

    /// @notice After this moment no invoice can be issued any more; the rest is refundable.
    function expiresAt() public view returns (uint64) {
        return biddingEnd + interval * installments;
    }

    /// @notice Earliest moment the next invoice may be issued.
    function nextInvoiceAt() public view returns (uint64) {
        return biddingEnd + interval * invoiceCount;
    }

    /// @notice What `bidder` would get back from `refund()` right now.
    function refundable(address bidder) public view returns (uint256) {
        if (refunded[bidder]) return 0;
        Phase p = phase();
        if (p == Phase.Failed) return pledgeOf[bidder] * installments;
        if (p == Phase.Completed) return pledgeOf[bidder] * (installments - invoiceCount);
        return 0;
    }

    /// @notice Proof that `bidder` paid installment `index`: amount and time, or (0, 0).
    function receipt(address bidder, uint256 index) external view returns (uint256 amount, uint64 paidAt) {
        if (index >= invoiceCount) return (0, 0);
        return (pledgeOf[bidder], invoicedAt[index]);
    }

    /// @notice The digest an invite key signs (EIP-191) to admit `bidder`.
    ///         Bound to chain and contract, so it cannot be replayed elsewhere.
    function inviteDigest(address bidder) public view returns (bytes32) {
        return keccak256(abi.encodePacked("pomona:invite", block.chainid, address(this), bidder));
    }

    function info() external view returns (Info memory) {
        return Info({
            token: address(token),
            organizer: organizer,
            target: target,
            minBid: minBid,
            biddingEnd: biddingEnd,
            interval: interval,
            installments: installments,
            inviteSigner: inviteSigner,
            total: total,
            bidderCount: bidderCount,
            invoiceCount: invoiceCount,
            nextInvoiceAt: nextInvoiceAt(),
            expiresAt: expiresAt(),
            phase: phase()
        });
    }

    // ---------------------------------------------------------------- bidders

    /// @notice Place or raise a bid of `amount` per installment.
    ///         Pulls `amount * installments`; requires a prior `approve`.
    /// @param invite Signature by `inviteSigner`; only checked on the first bid.
    function bid(uint256 amount, bytes calldata invite) external nonReentrant inPhase(Phase.Bidding) {
        if (amount == 0) revert ZeroAmount();
        uint256 previous = pledgeOf[msg.sender];
        if (previous == 0 && inviteSigner != address(0)) {
            bytes32 digest = MessageHashUtils.toEthSignedMessageHash(inviteDigest(msg.sender));
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, invite);
            if (err != ECDSA.RecoverError.NoError || signer != inviteSigner) revert InvalidInvite();
        }

        uint256 pledge = previous + amount;
        if (pledge < minBid) revert BelowMinBid();
        if (previous == 0) bidderCount++;
        pledgeOf[msg.sender] = pledge;
        total += amount;

        // Exact accounting: tokens that skim a fee on transfer are not supported.
        uint256 cost = amount * installments;
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), cost);
        if (token.balanceOf(address(this)) - before != cost) revert UnsupportedToken();

        emit Bid(msg.sender, amount, pledge, total);
    }

    /// @notice Lower or withdraw a bid (per installment) while bidding is open.
    function withdraw(uint256 amount) external nonReentrant inPhase(Phase.Bidding) {
        if (amount == 0) revert ZeroAmount();
        uint256 previous = pledgeOf[msg.sender];
        if (amount > previous) revert TooMuch();
        uint256 pledge = previous - amount;
        if (pledge != 0 && pledge < minBid) revert BelowMinBid();
        if (pledge == 0) bidderCount--;
        pledgeOf[msg.sender] = pledge;
        total -= amount;

        token.safeTransfer(msg.sender, amount * installments);
        emit Withdrawn(msg.sender, amount, pledge, total);
    }

    /// @notice Take back what has not been (and will not be) invoiced.
    function refund() external nonReentrant {
        uint256 amount = refundable(msg.sender);
        if (amount == 0) revert NothingToRefund();
        refunded[msg.sender] = true;
        token.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    // -------------------------------------------------------------- organizer

    /// @notice Release the next installment of every bid to the organizer.
    ///         At most once per interval and at most `installments` times.
    function invoice() external nonReentrant onlyOrganizer inPhase(Phase.Running) {
        if (block.timestamp < nextInvoiceAt()) revert NotDue();
        uint256 index = invoiceCount;
        uint64 at = uint64(block.timestamp);
        invoiceCount++;
        invoicedAt[index] = at;
        uint256 amount = total;
        token.safeTransfer(organizer, amount);
        emit Invoiced(index, amount, at);
    }

    /// @notice Abort during bidding; everyone gets the full deposit back.
    function cancel() external onlyOrganizer inPhase(Phase.Bidding) {
        cancelled = true;
        emit Cancelled();
    }

    /// @notice Stop invoicing early (project ends); bidders refund the rest.
    function terminate() external onlyOrganizer inPhase(Phase.Running) {
        terminated = true;
        emit Terminated(invoiceCount);
    }
}
