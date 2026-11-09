// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title Graveyard
/// @notice Escrow for adopting abandoned side projects. A buyer locks the asking price in USDC
///         against a listing. The money moves to the seller once the handover is proven: either
///         the buyer confirms it, or the verifier attests that the GitHub repo now belongs to the
///         buyer. If the seller never hands over, the buyer takes the money back after the
///         handover window. A seller can also walk away early, which refunds the buyer at once.
contract Graveyard {
    enum State {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Deal {
        bytes32 listing;
        address buyer;
        address seller;
        uint96 amount;
        uint40 openedAt;
        uint40 deadline;
        State state;
    }

    IERC20 public immutable usdc;
    address public owner;
    address public verifier;
    address public treasury;
    uint16 public feeBps; // cut on release, in basis points

    uint16 public constant MAX_FEE_BPS = 1000;
    uint40 public constant MIN_WINDOW = 1 hours;
    uint40 public constant MAX_WINDOW = 30 days;

    Deal[] internal _deals;
    /// @notice The open (Funded) deal on a listing, as id + 1. Zero means the plot is free.
    mapping(bytes32 => uint256) public openDealOf;

    event Adopted(
        uint256 indexed dealId, bytes32 indexed listing, address indexed buyer, address seller, uint256 amount, uint40 deadline
    );
    event Released(uint256 indexed dealId, bytes32 indexed listing, address by, uint256 toSeller, uint256 fee);
    event Refunded(uint256 indexed dealId, bytes32 indexed listing, address by, uint256 amount);
    event VerifierSet(address verifier);
    event FeeSet(uint16 feeBps, address treasury);

    error NotOwner();
    error NotAllowed();
    error BadState();
    error BadInput();
    error PlotTaken();
    error TooEarly();
    error TransferFailed();

    constructor(IERC20 usdc_, address verifier_, address treasury_, uint16 feeBps_) {
        if (feeBps_ > MAX_FEE_BPS || treasury_ == address(0)) revert BadInput();
        usdc = usdc_;
        owner = msg.sender;
        verifier = verifier_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    // ---------------------------------------------------------------- adopt

    /// @notice Lock `amount` against `listing`, payable to `seller` once the handover is proven.
    /// @param window seconds the seller has to hand over before the buyer may take the money back.
    function adopt(bytes32 listing, address seller, uint96 amount, uint40 window) external returns (uint256 dealId) {
        if (seller == address(0) || seller == msg.sender || amount == 0) revert BadInput();
        if (window < MIN_WINDOW || window > MAX_WINDOW) revert BadInput();
        if (openDealOf[listing] != 0) revert PlotTaken();

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        dealId = _deals.length;
        uint40 deadline = uint40(block.timestamp) + window;
        _deals.push(
            Deal({
                listing: listing,
                buyer: msg.sender,
                seller: seller,
                amount: amount,
                openedAt: uint40(block.timestamp),
                deadline: deadline,
                state: State.Funded
            })
        );
        openDealOf[listing] = dealId + 1;
        emit Adopted(dealId, listing, msg.sender, seller, amount, deadline);
    }

    // ---------------------------------------------------------------- release

    /// @notice The buyer says the project arrived. Pays the seller.
    function confirm(uint256 dealId) external {
        Deal storage d = _funded(dealId);
        if (msg.sender != d.buyer) revert NotAllowed();
        _release(dealId, d);
    }

    /// @notice The verifier saw the repo land in the buyer's GitHub account. Pays the seller.
    function attest(uint256 dealId) external {
        Deal storage d = _funded(dealId);
        if (msg.sender != verifier) revert NotAllowed();
        _release(dealId, d);
    }

    // ---------------------------------------------------------------- refund

    /// @notice Seller backs out at any time, or the buyer reclaims after the handover window.
    function refund(uint256 dealId) external {
        Deal storage d = _funded(dealId);
        if (msg.sender == d.seller) {
            // always allowed
        } else if (msg.sender == d.buyer) {
            if (block.timestamp < d.deadline) revert TooEarly();
        } else {
            revert NotAllowed();
        }
        d.state = State.Refunded;
        delete openDealOf[d.listing];
        if (!usdc.transfer(d.buyer, d.amount)) revert TransferFailed();
        emit Refunded(dealId, d.listing, msg.sender, d.amount);
    }

    // ---------------------------------------------------------------- views

    function deal(uint256 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    function dealCount() external view returns (uint256) {
        return _deals.length;
    }

    // ---------------------------------------------------------------- admin

    function setVerifier(address v) external {
        if (msg.sender != owner) revert NotOwner();
        verifier = v;
        emit VerifierSet(v);
    }

    function setFee(uint16 bps, address t) external {
        if (msg.sender != owner) revert NotOwner();
        if (bps > MAX_FEE_BPS || t == address(0)) revert BadInput();
        feeBps = bps;
        treasury = t;
        emit FeeSet(bps, t);
    }

    function transferOwnership(address o) external {
        if (msg.sender != owner) revert NotOwner();
        if (o == address(0)) revert BadInput();
        owner = o;
    }

    // ---------------------------------------------------------------- internal

    function _funded(uint256 dealId) internal view returns (Deal storage d) {
        if (dealId >= _deals.length) revert BadInput();
        d = _deals[dealId];
        if (d.state != State.Funded) revert BadState();
    }

    function _release(uint256 dealId, Deal storage d) internal {
        d.state = State.Released;
        delete openDealOf[d.listing];
        uint256 fee = (uint256(d.amount) * feeBps) / 10_000;
        uint256 toSeller = uint256(d.amount) - fee;
        if (!usdc.transfer(d.seller, toSeller)) revert TransferFailed();
        if (fee > 0 && !usdc.transfer(treasury, fee)) revert TransferFailed();
        emit Released(dealId, d.listing, msg.sender, toSeller, fee);
    }
}
