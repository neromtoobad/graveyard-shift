// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20s {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title Spirit
/// @notice The ERC20 a dead project is raised as. Only its Séance can mint (on buys) or burn (on sells).
contract Spirit {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable seance;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
        seance = msg.sender;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= value, "allowance");
            allowance[from][msg.sender] = a - value;
        }
        _move(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external {
        require(msg.sender == seance, "seance");
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function burn(address from, uint256 value) external {
        require(msg.sender == seance, "seance");
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function _move(address from, address to, uint256 value) internal {
        require(to != address(0), "zero");
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}

/// @title Séance
/// @notice A launchpad for dead side projects. A founder raises a buried project as a Spirit token
///         on a bonding curve priced in USDC. Buyers light candles; the curve's USDC reserve always
///         backs every sell, so there is nothing to rug. The project rises once the reserve reaches
///         RISE_AT.
///
///         A slice of every trade goes to a revival pot. The founder can only claim it while the
///         repo has a heartbeat: the verifier saw a new commit within the last HEARTBEAT. Founders
///         get paid for shipping, not for launching. When the project is adopted, the verifier hands
///         the founder seat (and the pot) to the adopter.
contract Seance {
    struct Launch {
        bytes32 listing;
        Spirit token;
        address founder;
        uint40 createdAt;
        uint40 lastPulse;
        uint40 risenAt;
        uint128 reserve; // USDC backing the curve
        uint128 pot; // revival pot, claimable by the founder while alive and risen
    }

    // Virtual constant-product curve: (VIRTUAL_USDC + reserve) * (VIRTUAL_TOKENS - supply) = K
    uint256 public constant VIRTUAL_USDC = 1_000e6;
    uint256 public constant VIRTUAL_TOKENS = 1_000_000_000e18;
    uint256 internal constant K = VIRTUAL_USDC * VIRTUAL_TOKENS;
    uint256 public constant RISE_AT = 1_500e6;
    uint256 public constant FEE_BPS = 300; // total fee per trade
    uint256 public constant POT_BPS = 200; // of which goes to the revival pot; the rest to the treasury
    uint40 public constant HEARTBEAT = 30 days;

    IERC20s public immutable usdc;
    address public owner;
    address public verifier;
    address public treasury;

    Launch[] internal _launches;
    /// @notice launch id + 1 for a listing; zero means not raised yet
    mapping(bytes32 => uint256) public launchOf;

    event Launched(uint256 indexed id, bytes32 indexed listing, address token, address founder, string symbol);
    event Trade(
        uint256 indexed id, address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 reserve, uint256 supply
    );
    event Risen(uint256 indexed id, uint256 reserve);
    event Pulse(uint256 indexed id, uint40 at);
    event Claimed(uint256 indexed id, address founder, uint256 amount);
    event FounderChanged(uint256 indexed id, address founder);

    error NotAllowed();
    error BadInput();
    error AlreadyRaised();
    error Slippage();
    error NotAlive();
    error NotRisen();
    error TransferFailed();

    constructor(IERC20s usdc_, address verifier_, address treasury_) {
        if (treasury_ == address(0)) revert BadInput();
        usdc = usdc_;
        owner = msg.sender;
        verifier = verifier_;
        treasury = treasury_;
    }

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert NotAllowed();
        _;
    }

    // ---------------------------------------------------------------- launch

    /// @notice Raise a buried project as a token. Relayed by the verifier after the founder signs,
    ///         so a listing can only be raised by the wallet that buried it.
    function launch(bytes32 listing, address founder, string calldata name_, string calldata symbol_)
        external
        onlyVerifier
        returns (uint256 id)
    {
        if (founder == address(0) || bytes(symbol_).length == 0 || bytes(symbol_).length > 10) revert BadInput();
        if (launchOf[listing] != 0) revert AlreadyRaised();
        Spirit t = new Spirit(name_, symbol_);
        id = _launches.length;
        _launches.push(
            Launch({
                listing: listing,
                token: t,
                founder: founder,
                createdAt: uint40(block.timestamp),
                lastPulse: 0,
                risenAt: 0,
                reserve: 0,
                pot: 0
            })
        );
        launchOf[listing] = id + 1;
        emit Launched(id, listing, address(t), founder, symbol_);
    }

    // ---------------------------------------------------------------- trade

    /// @notice Light a candle: pay `usdcIn`, receive at least `minOut` tokens.
    function buy(uint256 id, uint256 usdcIn, uint256 minOut) external returns (uint256 out) {
        Launch storage l = _get(id);
        if (usdcIn == 0) revert BadInput();
        uint256 fee = (usdcIn * FEE_BPS) / 10_000;
        uint256 toPot = (usdcIn * POT_BPS) / 10_000;
        uint256 net = usdcIn - fee;
        out = _buyOut(l, net);
        if (out == 0 || out < minOut) revert Slippage();

        if (!usdc.transferFrom(msg.sender, address(this), usdcIn)) revert TransferFailed();
        if (fee > toPot && !usdc.transfer(treasury, fee - toPot)) revert TransferFailed();
        l.reserve += uint128(net);
        l.pot += uint128(toPot);
        l.token.mint(msg.sender, out);

        if (l.risenAt == 0 && l.reserve >= RISE_AT) {
            l.risenAt = uint40(block.timestamp);
            emit Risen(id, l.reserve);
        }
        emit Trade(id, msg.sender, true, usdcIn, out, l.reserve, l.token.totalSupply());
    }

    /// @notice Snuff a candle: return `tokensIn`, receive at least `minOut` USDC.
    function sell(uint256 id, uint256 tokensIn, uint256 minOut) external returns (uint256 out) {
        Launch storage l = _get(id);
        if (tokensIn == 0) revert BadInput();
        uint256 gross = _sellGross(l, tokensIn);
        uint256 fee = (gross * FEE_BPS) / 10_000;
        uint256 toPot = (gross * POT_BPS) / 10_000;
        out = gross - fee;
        if (out == 0 || out < minOut) revert Slippage();

        l.token.burn(msg.sender, tokensIn);
        l.reserve -= uint128(gross);
        l.pot += uint128(toPot);
        if (!usdc.transfer(msg.sender, out)) revert TransferFailed();
        if (fee > toPot && !usdc.transfer(treasury, fee - toPot)) revert TransferFailed();
        emit Trade(id, msg.sender, false, out, tokensIn, l.reserve, l.token.totalSupply());
    }

    // ---------------------------------------------------------------- heartbeat + pot

    /// @notice The verifier saw a new commit on the project's repo.
    function pulse(uint256 id) external onlyVerifier {
        Launch storage l = _get(id);
        l.lastPulse = uint40(block.timestamp);
        emit Pulse(id, l.lastPulse);
    }

    /// @notice Hand the founder seat to a new owner (on adoption). The verifier or the founder may do it.
    function setFounder(uint256 id, address founder) external {
        Launch storage l = _get(id);
        if (msg.sender != verifier && msg.sender != l.founder) revert NotAllowed();
        if (founder == address(0)) revert BadInput();
        l.founder = founder;
        emit FounderChanged(id, founder);
    }

    /// @notice The founder takes the revival pot. Only once risen, and only while the repo is alive.
    function claim(uint256 id) external returns (uint256 amount) {
        Launch storage l = _get(id);
        if (msg.sender != l.founder) revert NotAllowed();
        if (l.risenAt == 0) revert NotRisen();
        if (!_alive(l)) revert NotAlive();
        amount = l.pot;
        l.pot = 0;
        if (amount > 0 && !usdc.transfer(msg.sender, amount)) revert TransferFailed();
        emit Claimed(id, msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }

    function info(uint256 id)
        external
        view
        returns (Launch memory l, uint256 supply, uint256 priceE18, bool alive)
    {
        Launch storage st = _get(id);
        l = st;
        supply = l.token.totalSupply();
        // USDC (6 decimals) per whole token, scaled by 1e18 so small prices survive
        priceE18 = ((VIRTUAL_USDC + l.reserve) * 1e36) / (VIRTUAL_TOKENS - supply);
        alive = _alive(st);
    }

    function quoteBuy(uint256 id, uint256 usdcIn) external view returns (uint256) {
        Launch storage l = _get(id);
        return _buyOut(l, usdcIn - (usdcIn * FEE_BPS) / 10_000);
    }

    function quoteSell(uint256 id, uint256 tokensIn) external view returns (uint256) {
        Launch storage l = _get(id);
        uint256 gross = _sellGross(l, tokensIn);
        return gross - (gross * FEE_BPS) / 10_000;
    }

    // ---------------------------------------------------------------- admin

    function setVerifier(address v) external {
        if (msg.sender != owner) revert NotAllowed();
        verifier = v;
    }

    function setTreasury(address t) external {
        if (msg.sender != owner || t == address(0)) revert NotAllowed();
        treasury = t;
    }

    // ---------------------------------------------------------------- internal

    function _get(uint256 id) internal view returns (Launch storage) {
        if (id >= _launches.length) revert BadInput();
        return _launches[id];
    }

    function _alive(Launch storage l) internal view returns (bool) {
        return l.lastPulse != 0 && block.timestamp <= uint256(l.lastPulse) + HEARTBEAT;
    }

    function _buyOut(Launch storage l, uint256 net) internal view returns (uint256) {
        uint256 supply = l.token.totalSupply();
        uint256 x = VIRTUAL_USDC + l.reserve + net;
        uint256 y = VIRTUAL_TOKENS - supply;
        uint256 newY = (K + x - 1) / x; // round up: the curve keeps the dust
        return y > newY ? y - newY : 0;
    }

    function _sellGross(Launch storage l, uint256 tokensIn) internal view returns (uint256) {
        uint256 supply = l.token.totalSupply();
        if (tokensIn > supply) revert BadInput();
        uint256 y = VIRTUAL_TOKENS - supply + tokensIn;
        uint256 newX = (K + y - 1) / y;
        uint256 x = VIRTUAL_USDC + l.reserve;
        return x > newX ? x - newX : 0;
    }
}
