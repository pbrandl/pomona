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
///         A bid is an amount *per installment*. If the sum of bids reaches the
///         target by the bidding deadline, the round runs `installments`
///         invoices, one per `interval`. Two ways to pay, chosen at creation:
///
///         Mode.Deposit (escrow): a bidder deposits `bid * installments` while
///         bidding. Target missed: full refund. Target reached: the organizer
///         invoices once per interval and each invoice releases one installment
///         of every bid. What is not invoiced goes back to the bidders.
///
///         Mode.Invoice (pay as you go): bidding locks no money. Target reached:
///         invoice i is issued automatically at `biddingEnd + i * interval`, and
///         every bidder pays it from their own wallet (`pay`), straight to the
///         organizer. Only a payment creates a receipt. Issued invoices stay
///         payable later; nothing is guaranteed to the organizer.
///
///         There are no admin keys and no upgrade path. See docs/CONTRACT.md.
contract PomonaRound is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice How bidders pay. See the contract notice.
    enum Mode {
        Deposit,
        Invoice
    }

    /// @notice Lifecycle of a round. Derived from time and state, never stored.
    enum Phase {
        Bidding, //   accepting, raising and withdrawing bids
        Failed, //    cancelled or target missed: full refunds
        Running, //   target reached: organizer invoices installment by installment
        Completed //  schedule over, all invoiced or terminated: refunds of the rest
    }

    /// @notice Everything the app shows, in one call.
    struct Info {
        Mode mode;
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

    Mode public immutable mode;
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
    /// @dev Deposit mode: invoices issued by the organizer. Use invoiceCount().
    uint32 private _invoiced;
    bool public cancelled;
    bool public terminated;
    uint64 public terminatedAt;
    /// @notice Bid per installment of each bidder. Frozen once bidding ends.
    mapping(address => uint256) public pledgeOf;
    mapping(address => bool) public refunded;
    mapping(uint256 => uint64) public invoicedAt;

    /// @dev Invoice mode: when `bidder` paid invoice `index` (0 = unpaid).
    mapping(address => mapping(uint256 => uint64)) public paidAt;
    /// @notice Invoice mode: how many bidders paid invoice `index`, and how much.
    mapping(uint256 => uint32) public paidCount;
    mapping(uint256 => uint256) public paidSum;
    /// @dev Everyone who ever bid, for the organizer's list of open invoices.
    address[] private _bidders;
    mapping(address => bool) private _known;

    event Bid(address indexed bidder, uint256 amount, uint256 pledge, uint256 total);
    event Withdrawn(address indexed bidder, uint256 amount, uint256 pledge, uint256 total);
    event Invoiced(uint256 indexed index, uint256 amount, uint64 at);
    event Paid(address indexed bidder, uint256 indexed index, uint256 amount, uint64 at);
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
    error WrongMode();
    error NotIssued();
    error NotBidder();
    error AlreadyPaid();

    constructor(
        Mode mode_,
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
        mode = mode_;
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
        if (terminated || block.timestamp >= expiresAt()) return Phase.Completed;
        if (mode == Mode.Deposit && _invoiced == installments) return Phase.Completed;
        return Phase.Running;
    }

    /// @notice Invoices issued so far. Deposit: by the organizer. Invoice mode:
    ///         automatically, one per interval from `biddingEnd`, until the
    ///         schedule ends or the organizer terminates the round.
    function invoiceCount() public view returns (uint32) {
        if (mode == Mode.Deposit) return _invoiced;
        if (cancelled || block.timestamp < biddingEnd || total < target) return 0;
        uint256 until = terminated ? terminatedAt : block.timestamp;
        if (until < biddingEnd) return 0;
        uint256 n = (until - biddingEnd) / interval + 1;
        return n > installments ? installments : uint32(n);
    }

    /// @notice When invoice `index` was issued (Deposit: invoiced; Invoice mode: due date), or 0.
    function issuedAt(uint256 index) external view returns (uint64) {
        if (mode == Mode.Deposit) return invoicedAt[index];
        return index < invoiceCount() ? biddingEnd + interval * uint64(index) : 0;
    }

    /// @notice All current bids per installment (no addresses), for average and median.
    function pledges() external view returns (uint256[] memory out) {
        uint256 n;
        for (uint256 i = 0; i < _bidders.length; i++) if (pledgeOf[_bidders[i]] != 0) n++;
        out = new uint256[](n);
        uint256 k;
        for (uint256 i = 0; i < _bidders.length; i++) {
            uint256 p = pledgeOf[_bidders[i]];
            if (p != 0) out[k++] = p;
        }
    }

    /// @notice Invoice mode: bidders who have not paid issued invoice `index` yet.
    function unpaid(uint256 index) external view returns (address[] memory bidders, uint256[] memory amounts) {
        uint256 n;
        bool issued = mode == Mode.Invoice && index < invoiceCount();
        if (issued) {
            for (uint256 i = 0; i < _bidders.length; i++) {
                address b = _bidders[i];
                if (pledgeOf[b] != 0 && paidAt[b][index] == 0) n++;
            }
        }
        bidders = new address[](n);
        amounts = new uint256[](n);
        if (!issued) return (bidders, amounts);
        uint256 k;
        for (uint256 i = 0; i < _bidders.length; i++) {
            address b = _bidders[i];
            if (pledgeOf[b] != 0 && paidAt[b][index] == 0) {
                bidders[k] = b;
                amounts[k] = pledgeOf[b];
                k++;
            }
        }
    }

    /// @notice After this moment no invoice can be issued any more; the rest is refundable.
    function expiresAt() public view returns (uint64) {
        return biddingEnd + interval * installments;
    }

    /// @notice Earliest moment the next invoice may be issued.
    function nextInvoiceAt() public view returns (uint64) {
        return biddingEnd + interval * invoiceCount();
    }

    /// @notice What `bidder` would get back from `refund()` right now.
    function refundable(address bidder) public view returns (uint256) {
        if (mode == Mode.Invoice || refunded[bidder]) return 0;
        Phase p = phase();
        if (p == Phase.Failed) return pledgeOf[bidder] * installments;
        if (p == Phase.Completed) return pledgeOf[bidder] * (installments - _invoiced);
        return 0;
    }

    /// @notice Proof that `bidder` paid installment `index`: amount and time, or (0, 0).
    function receipt(address bidder, uint256 index) external view returns (uint256 amount, uint64 at) {
        if (mode == Mode.Invoice) {
            uint64 t = paidAt[bidder][index];
            return t == 0 ? (0, 0) : (pledgeOf[bidder], t);
        }
        if (index >= _invoiced) return (0, 0);
        return (pledgeOf[bidder], invoicedAt[index]);
    }

    /// @notice The digest an invite key signs (EIP-191) to admit `bidder`.
    ///         Bound to chain and contract, so it cannot be replayed elsewhere.
    function inviteDigest(address bidder) public view returns (bytes32) {
        return keccak256(abi.encodePacked("pomona:invite", block.chainid, address(this), bidder));
    }

    function info() external view returns (Info memory) {
        return Info({
            mode: mode,
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
            invoiceCount: invoiceCount(),
            nextInvoiceAt: nextInvoiceAt(),
            expiresAt: expiresAt(),
            phase: phase()
        });
    }

    // ---------------------------------------------------------------- bidders

    /// @notice Place or raise a bid of `amount` per installment.
    ///         Deposit mode: pulls `amount * installments` (requires `approve`).
    ///         Invoice mode: a promise only, no money moves.
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
        if (!_known[msg.sender]) {
            _known[msg.sender] = true;
            _bidders.push(msg.sender);
        }
        pledgeOf[msg.sender] = pledge;
        total += amount;

        if (mode == Mode.Invoice) {
            emit Bid(msg.sender, amount, pledge, total);
            return;
        }
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

        if (mode == Mode.Deposit) token.safeTransfer(msg.sender, amount * installments);
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

    /// @notice Invoice mode: pay issued invoice `index` from the caller's wallet,
    ///         straight to the organizer. Requires `approve` of the amount.
    ///         Creates the receipt. Can be paid late, but only once.
    function pay(uint256 index) external nonReentrant {
        if (mode != Mode.Invoice) revert WrongMode();
        if (index >= invoiceCount()) revert NotIssued();
        uint256 amount = pledgeOf[msg.sender];
        if (amount == 0) revert NotBidder();
        if (paidAt[msg.sender][index] != 0) revert AlreadyPaid();
        uint64 at = uint64(block.timestamp);
        paidAt[msg.sender][index] = at;
        paidCount[index]++;
        paidSum[index] += amount;

        uint256 before = token.balanceOf(organizer);
        token.safeTransferFrom(msg.sender, organizer, amount);
        if (token.balanceOf(organizer) - before != amount) revert UnsupportedToken();
        emit Paid(msg.sender, index, amount, at);
    }

    // -------------------------------------------------------------- organizer

    /// @notice Deposit mode: release the next installment of every bid to the
    ///         organizer. At most once per interval and at most `installments` times.
    function invoice() external nonReentrant onlyOrganizer inPhase(Phase.Running) {
        if (mode != Mode.Deposit) revert WrongMode();
        if (block.timestamp < nextInvoiceAt()) revert NotDue();
        uint256 index = _invoiced;
        uint64 at = uint64(block.timestamp);
        _invoiced++;
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

    /// @notice Stop invoicing early (project ends). Deposit: bidders refund the
    ///         rest. Invoice mode: no new invoices; issued ones stay payable.
    function terminate() external onlyOrganizer inPhase(Phase.Running) {
        uint32 issued = invoiceCount();
        terminated = true;
        terminatedAt = uint64(block.timestamp);
        emit Terminated(issued);
    }
}
