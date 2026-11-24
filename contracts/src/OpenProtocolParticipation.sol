// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @notice Testnet reference implementation. Assumptions are documented in REQUIREMENTS.md.
contract OpenProtocolParticipation is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    uint256 private constant BPS = 10_000;
    uint256 private constant ACC = 1e24;
    uint256 private constant WEEK = 7 days;
    uint8 private constant MAX_UPLINE = 10;
    uint8 private constant MAX_WORKING_UPLINE = 9;
    /// @dev Working Pool table levels 1–15 (team 2–30), per the published programme.
    uint8 private constant MAX_WORKING_LEVEL = 15;
    /// @notice Share of every withdrawal that funds the 1–5 Star royalty clubs.
    uint256 public constant ROYALTY_BPS = 1_500;
    /// @notice Share of every withdrawal sent to the development fund.
    uint256 public constant DEVELOPMENT_BPS = 500;
    /// @notice Each of the five star clubs receives an equal 3% of every withdrawal.
    uint256 public constant CLUB_SHARE_BPS = 300;
    uint8 private constant STAR_CLUBS = 5;
    /// @notice Sponsor's share of the 15 USDT Working allocation for each direct after activation.
    uint256 public constant DIRECT_SHARE_BPS = 8_000;
    /// @notice Directs needed before direct and upline income is paid.
    uint64 public constant ACTIVATION_DIRECTS = 2;
    /// @notice Working Level 1 (team 2, ID 15): the 1st direct pays the sponsor 12 USDT and the uplines 3 USDT;
    /// this direct's whole 15 USDT is the sponsor's auto-upgrade into Level 2. Every later direct pays 12 + 3 again.
    uint64 public constant UPGRADE_DIRECT = 2;
    /// @notice Weekly directs needed to win the Superstar fund.
    uint64 public constant SUPERSTAR_MIN_DIRECTS = 5;
    /// @notice Directs added per star club to claim its royalty: 2 Star 4, 3 Star 8, 4 Star 12, 5 Star 16.
    uint64 public constant CLUB_CLAIM_DIRECTS_STEP = 4;

    struct Participant { uint64 id; uint64 directCount; address sponsor; uint64 joinedAt; }
    struct WeeklyCompetition { address leader; uint64 winningDirects; bool closed; }

    error ZeroAddress();
    error UnsupportedTokenDecimals(uint8 decimals);
    error AlreadyRegistered(address account);
    error SponsorNotRegistered(address sponsor);
    error SelfSponsorship();
    error IncorrectTokenReceipt(address recipient, uint256 expected, uint256 received);
    error NothingToClaim();
    error WeekNotFinished(uint256 week);
    error WeekAlreadyClosed(uint256 week);
    error InvalidLevel(uint8 level);

    IERC20 public paymentToken;
    address public workingPool;
    address public nonWorkingPool;
    address public fiveStarClub;
    address public developmentFund;
    uint256 public ticketPrice;
    uint256 public tokenUnit;
    uint256 public workingAllocation;
    uint256 public nonWorkingAllocation;
    uint256 public clubAllocation;

    uint64 public memberCount;
    uint64 internal matrixCursor; // retired: Global Matrix placement (kept for storage layout)
    uint64 public fiveStarCount;
    uint256 public totalParticipated;
    uint256 public totalWorkingAllocated;
    uint256 public totalNonWorkingAllocated;
    uint256 public totalClubAllocated;
    uint256 public totalGrossRewards;
    uint256 public totalClaimedGross;
    uint256 public workingReserve;
    uint256 public singleLegReserve;
    uint256 public nonWorkingReserve;
    uint256 public pendingNonWorkingRedirect;
    uint256 public superstarReserve;
    uint256 public fiveStarLiability;
    uint256 public accFiveStarRewardPerMember;
    uint256 public totalFiveStarWeight;
    uint256 public workingAutoUpgradeConsumed;
    uint256 public nonWorkingAutoUpgradeConsumed;

    mapping(address => Participant) private participants;
    mapping(uint64 => address) public memberById;
    mapping(uint64 => address) internal matrixQueue; // retired
    mapping(address => address) internal matrixParent; // retired
    mapping(address => address[2]) private matrixChildren;
    mapping(address => uint64) public teamCount;
    mapping(address => uint8) public workingLevel;
    mapping(address => uint8) public nonWorkingLevel;
    mapping(address => uint8) public starRank;
    mapping(address => uint64) public workingReentries;
    mapping(address => uint64) public nonWorkingReentries;
    mapping(address => uint64) public singleLegEntries;
    mapping(address => uint64) public singleLegReentries;
    mapping(address => uint256) public nonWorkingEntryCredit;
    mapping(address => mapping(uint8 => uint64)) public qualifiedLevelTeamCount;
    mapping(address => uint256) public autoUpgradeCredit;
    mapping(address => uint256) public claimable;
    mapping(address => uint256) public fiveStarRewardDebt;
    mapping(address => uint64) public fiveStarWeight;
    mapping(address => uint8) public singleLegLevel;
    mapping(address => uint256) public pendingSingleLegIncome;
    mapping(address => uint256) public pendingWorkingPoolIncome;
    mapping(address => uint256) public pendingNonWorkingPoolIncome;
    mapping(address => uint256) public rankedPoolRewardsCredited;
    mapping(uint256 => mapping(address => uint64)) public weeklyDirects;
    mapping(uint256 => WeeklyCompetition) public weeklyCompetition;

    // ---- Appended in the star-club royalty upgrade (uses 5 gap slots). ----
    /// @notice Royalty per 1–4 Star club member, scaled by 1e24. The 5 Star club keeps its weighted accumulator.
    mapping(uint8 => uint256) public accClubRewardPerMember;
    /// @notice Members currently enrolled in each 1–4 Star club.
    mapping(uint8 => uint64) public clubMemberCount;
    /// @notice The 1–4 Star club an account is enrolled in; 0 when not enrolled (unregistered, unsynced, or 5 Star).
    mapping(address => uint8) public clubRank;
    mapping(address => uint256) public clubRewardDebt;
    /// @notice Royalty owed to 1–4 Star club members and not yet credited.
    uint256 public clubLiability;

    // ---- Appended in the per-level team upgrade (uses 2 gap slots). ----
    /// @notice Team members at each sponsor level below an account: level 1 = directs ... level 15.
    mapping(address => mapping(uint8 => uint64)) public levelTeamCount;
    /// @notice Whether a member has been added to their uplines' level counts (set on register or by sync).
    mapping(address => bool) public levelTeamRecorded;

    // ---- Appended in the on-chain ledger upgrade (uses 6 gap slots). ----
    /// @notice Lifetime income credited to an account, per reason code (credits from this upgrade onward).
    mapping(address => mapping(bytes32 => uint256)) public incomeByReason;
    mapping(address => mapping(bytes32 => uint64)) public incomeCountByReason;
    /// @notice Lifetime gross amount an account has withdrawn, and how many withdrawals.
    mapping(address => uint256) public totalWithdrawnGross;
    mapping(address => uint64) public withdrawCount;
    mapping(address => address[]) private directList;
    mapping(address => bool) public directListed;

    // ---- Appended in the held-royalty upgrade (uses 2 gap slots). ----
    /// @notice Club royalty earned while the member has fewer directs than clubClaimDirects(rank).
    mapping(address => uint256) public heldRoyalty;
    uint256 public heldRoyaltyLiability;

    // ---- Appended in the Non-Working entry upgrade (uses 1 gap slot). ----
    /// @notice Team members (10 levels deep) who entered the Non-Working matrix by reaching Single-Leg Level 1.
    mapping(address => uint64) internal nonWorkingTeamCount; // retired: every member now enters on joining

    // ---- Appended in the global Single-Leg line upgrade (uses 6 gap slots). ----
    /// @notice Single-Leg is one global line, first come first served. Each registration and each
    /// Level 3 re-entry adds a position; a position's team is every position after it.
    uint64 public lineLength;
    mapping(uint64 => address) internal lineOwner;
    mapping(address => uint64) internal primaryPosition;
    mapping(address => uint64) public reentryPosition;
    mapping(address => uint8) public reentryLevel;
    /// @notice Per Single-Leg level: every position before this one has enough (qualified) members after it.
    mapping(uint8 => uint64) public lineCursor;

    // ---- Appended in the Working upgrade-fill upgrade (uses 1 gap slot). ----
    /// @notice Team members (15 levels deep) who have entered each Working level: everyone enters Level 1 by
    /// joining and enters Level L+1 by completing Level L. Level L (L >= 2) completes with 2×L of them.
    mapping(address => mapping(uint8 => uint64)) internal workingEnteredCount; // retired

    // ---- Appended in the 30 USDT ticket upgrade (uses 1 gap slot). ----
    /// @notice Share of every ticket paid straight into the Non-Working pool (5 USDT of 30).
    uint256 public nonWorkingTicketAllocation;

    // ---- Appended in the self-funding matrix upgrade (uses 1 gap slot). ----
    /// @notice Entries placed in a member's matrix at the level they are filling.
    /// Key = level for Working, level + 16 for Non-Working.
    mapping(address => mapping(uint8 => uint8)) public matrixFilled;

    // ---- Appended in the qualified Single-Leg upgrade (uses 2 gap slots). ----
    /// @notice Positions in the line that have reached each Single-Leg level.
    mapping(uint8 => uint64) public singleLegReached;
    /// @dev Per level L (>= 2): positions before lineCursor[L] that have reached Level L-1.
    mapping(uint8 => uint64) internal singleLegBehind;

    // Storage reserved for future implementations. New state must be appended here
    // and the gap reduced by the same number of slots.
    uint256[23] private __gap;

    event ParticipantRegistered(address indexed account, address indexed sponsor, uint64 indexed memberId, uint64 joinedAt);
    event MatrixPlaced(address indexed account, address indexed parent, uint64 position);
    event ParticipationAllocated(address indexed account, uint256 workingAmount, uint256 nonWorkingAmount, uint256 clubAmount);
    event RewardCredited(address indexed account, uint256 amount, bytes32 indexed reason);
    event RankAdvanced(address indexed account, uint8 previousRank, uint8 newRank);
    event LevelAdvanced(address indexed account, uint8 workingLevel, uint8 nonWorkingLevel);
    event Reentered(address indexed account, bool indexed working, uint64 cycle, uint256 reward);
    event WeekClosed(uint256 indexed week, address indexed winner, uint256 reward);
    event Claimed(address indexed account, uint256 gross, uint256 net, uint256 royalty, uint256 development);
    event PoolIncomeQueued(address indexed account, uint8 indexed pool, uint8 level, uint256 amount);
    event PoolIncomeSettled(address indexed account, uint256 singleLeg, uint256 working, uint256 nonWorking);
    event FiveStarWeightAdvanced(address indexed account, uint64 weight);
    event SingleLegReentered(address indexed account, uint64 entry, uint256 amount);
    event NonWorkingEntryFunded(address indexed account, uint256 amount);
    /// @notice `member` entered `level` of a matrix; `host` is the upline whose position it filled (0: none, stays in reserve).
    event LevelEntered(address indexed member, address indexed host, bool indexed working, uint8 level);
    event ClubRoyaltyDistributed(uint8 indexed rank, uint256 amount, uint64 members);
    event ClubMembershipChanged(address indexed account, uint8 previousClub, uint8 newClub);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IERC20Metadata token_,
        address workingPool_,
        address nonWorkingPool_,
        address fiveStarClub_,
        address developmentFund_,
        address genesisParticipant_
    ) public initializer {
        if (address(token_) == address(0) || workingPool_ == address(0) || nonWorkingPool_ == address(0)
            || fiveStarClub_ == address(0) || developmentFund_ == address(0) || genesisParticipant_ == address(0)) {
            revert ZeroAddress();
        }
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        uint8 decimals = token_.decimals();
        if (decimals > 72) revert UnsupportedTokenDecimals(decimals);
        uint256 unit = 10 ** decimals;
        paymentToken = IERC20(address(token_));
        tokenUnit = unit;
        workingPool = workingPool_;
        nonWorkingPool = nonWorkingPool_;
        fiveStarClub = fiveStarClub_;
        developmentFund = developmentFund_;
        workingAllocation = 15 * unit;
        nonWorkingAllocation = 9 * unit;
        clubAllocation = unit;
        _setTicket(unit);
        memberCount = 1;
        participants[genesisParticipant_] = Participant(1, 0, address(0), uint64(block.timestamp));
        starRank[genesisParticipant_] = 1;
        _syncClub(genesisParticipant_);
        singleLegEntries[genesisParticipant_] = 1;
        memberById[1] = genesisParticipant_;
        emit ParticipantRegistered(genesisParticipant_, address(0), 1, uint64(block.timestamp));
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice One-time move of a live proxy to the 30 USDT ticket (run in the upgrade transaction).
    function initializeTicket30() external reinitializer(2) onlyOwner {
        _setTicket(tokenUnit);
    }
    /// @dev 30 USDT ticket: 15 Working, 5 Non-Working, 9 Single-Leg (`nonWorkingAllocation`), 1 Superstar.
    function _setTicket(uint256 unit) private {
        ticketPrice = 30 * unit;
        nonWorkingTicketAllocation = 5 * unit;
    }

    function register(address sponsor) external nonReentrant {
        if (participants[msg.sender].id != 0) revert AlreadyRegistered(msg.sender);
        if (sponsor == msg.sender) revert SelfSponsorship();
        if (participants[sponsor].id == 0) revert SponsorNotRegistered(sponsor);
        _receiveExact(msg.sender, ticketPrice);

        _initLine();
        uint64 newId = ++memberCount;
        participants[msg.sender] = Participant(newId, 0, sponsor, uint64(block.timestamp));
        starRank[msg.sender] = 1;
        _syncClub(msg.sender);
        singleLegEntries[msg.sender] = 1;
        participants[sponsor].directCount++;
        memberById[newId] = msg.sender;
        // Per-level counts first, so rank checks during team growth see this registration.
        _recordLevelTeam(msg.sender);
        _recordTeamGrowth(sponsor);
        _recordDirect(msg.sender);
        _recordWeeklyDirect(sponsor);
        primaryPosition[msg.sender] = _addToLine(msg.sender);
        _processOwner(sponsor);
        _sweepLine();

        totalParticipated += ticketPrice;
        totalWorkingAllocated += workingAllocation;
        totalNonWorkingAllocated += nonWorkingAllocation + nonWorkingTicketAllocation;
        totalClubAllocated += clubAllocation;
        _allocateWorking(sponsor);
        singleLegReserve += nonWorkingAllocation;
        nonWorkingReserve += nonWorkingTicketAllocation;
        _enterMatrix(msg.sender, false, 1);
        superstarReserve += clubAllocation;
        emit ParticipantRegistered(msg.sender, sponsor, newId, uint64(block.timestamp));
        emit RankAdvanced(msg.sender, 0, 1);
        emit ParticipationAllocated(msg.sender, workingAllocation, nonWorkingAllocation + nonWorkingTicketAllocation, clubAllocation);
    }

    function claim() external nonReentrant {
        _syncClub(msg.sender);
        _settleClub(msg.sender);
        _settleFiveStar(msg.sender);
        _releaseHeldRoyalty(msg.sender);
        uint256 gross = claimable[msg.sender];
        if (gross == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalClaimedGross += gross;
        totalWithdrawnGross[msg.sender] += gross;
        withdrawCount[msg.sender]++;
        uint256 royalty = gross * ROYALTY_BPS / BPS;
        uint256 development = gross * DEVELOPMENT_BPS / BPS;
        uint256 net = gross - royalty - development;
        paymentToken.safeTransfer(msg.sender, net);
        paymentToken.safeTransfer(developmentFund, development);
        _distributeRoyalty(royalty);
        emit Claimed(msg.sender, gross, net, royalty, development);
    }

    function closeWeek(uint256 week) external nonReentrant {
        if (week >= currentWeek()) revert WeekNotFinished(week);
        WeeklyCompetition storage competition = weeklyCompetition[week];
        if (competition.closed) revert WeekAlreadyClosed(week);
        competition.closed = true;
        uint256 reward;
        if (competition.leader != address(0) && competition.winningDirects >= 5) {
            reward = superstarReserve;
            superstarReserve = 0;
            _credit(competition.leader, reward, keccak256("WEEKLY_SUPERSTAR"));
        }
        emit WeekClosed(week, competition.leader, reward);
    }

    function pendingFiveStarReward(address account) public view returns (uint256) {
        if (starRank[account] != 5) return 0;
        uint256 accumulated = uint256(fiveStarWeight[account]) * accFiveStarRewardPerMember;
        uint256 debt = fiveStarRewardDebt[account];
        return accumulated > debt ? (accumulated - debt) / ACC : 0;
    }
    function pendingClubReward(address account) public view returns (uint256) {
        uint8 club = clubRank[account];
        if (club == 0) return 0;
        uint256 accumulated = accClubRewardPerMember[club];
        uint256 debt = clubRewardDebt[account];
        return accumulated > debt ? (accumulated - debt) / ACC : 0;
    }
    /// @notice Team size at each of the 10 sponsor levels below `account` (index 0 = level 1 = directs).
    function getLevelTeamCounts(address account) external view returns (uint64[10] memory counts) {
        for (uint8 level = 1; level <= MAX_UPLINE; ++level) counts[level - 1] = levelTeamCount[account][level];
    }
    /// @notice Re-checks `account`'s star rank against `rankRule`. Permissionless.
    function syncRank(address account) external nonReentrant {
        if (participants[account].id == 0) revert SponsorNotRegistered(account);
        _updateRank(account);
    }
    /// @notice Re-checks all of `account`'s Single-Leg positions. Permissionless.
    function syncSingleLeg(address account) external nonReentrant {
        if (participants[account].id == 0) revert SponsorNotRegistered(account);
        _initLine();
        _processOwner(account);
        _sweepLine();
    }
    /// @notice An account's Single-Leg positions and levels, and the current line length.
    function singleLegInfo(address account) external view returns (uint64 primary, uint8 primaryLevel, uint64 reentry, uint8 reentryLvl, uint64 line) {
        return (_primaryOf(account), singleLegLevel[account], reentryPosition[account], reentryLevel[account], _lineLen());
    }
    function lineOwnerAt(uint64 position) public view returns (address) {
        address owner = lineOwner[position];
        return owner == address(0) ? memberById[position] : owner;
    }
    function settlePoolRewards() external nonReentrant {
        uint256 cap = poolRewardCap(msg.sender);
        uint256 credited = rankedPoolRewardsCredited[msg.sender];
        uint256 capacity = cap == type(uint256).max ? type(uint256).max : cap > credited ? cap - credited : 0;

        uint256 singleAmount = _settleSingleLegBacked(msg.sender, capacity);
        capacity = capacity == type(uint256).max ? capacity : capacity - singleAmount;
        uint256 workingAmount = _settleWorkingBacked(pendingWorkingPoolIncome, msg.sender, capacity);
        capacity = capacity == type(uint256).max ? capacity : capacity - workingAmount;
        uint256 nonWorkingAmount = _settleNonWorkingBacked(msg.sender, capacity);
        uint256 total = singleAmount + workingAmount + nonWorkingAmount;
        rankedPoolRewardsCredited[msg.sender] += total;
        _credit(msg.sender, singleAmount, keccak256("SINGLE_LEG_INCOME"));
        _credit(msg.sender, workingAmount, keccak256("WORKING_LEVEL_INCOME"));
        _credit(msg.sender, nonWorkingAmount, keccak256("NON_WORKING_MATRIX_INCOME"));
        emit PoolIncomeSettled(msg.sender, singleAmount, workingAmount, nonWorkingAmount);
    }
    function poolRewardCap(address account) public view returns (uint256) {
        (, , , uint256 cap) = rankRule(starRank[account] == 0 ? 1 : starRank[account]);
        return cap;
    }
    /// @notice The single source of truth for star ranks: directs needed, the referral-tree level and
    /// the members needed at that level (0 = none), and the lifetime pool-income cap.
    /// 3 Star = 16 at level 2, 4 Star = 64 at level 3, 5 Star = 300 at level 4, from any of the member's
    /// directs. Club royalty accrues from rank-up and is claimable with clubClaimDirects(rank) directs.
    function rankRule(uint8 rank) public view returns (uint64 directs, uint8 qualifiedLevel, uint64 qualifiedCount, uint256 cap) {
        if (rank == 0 || rank > 5) revert InvalidLevel(rank);
        if (rank == 1) return (0, 0, 0, ticketPrice * 2);
        if (rank == 2) return (4, 0, 0, ticketPrice * 5);
        if (rank == 3) return (0, 2, 16, ticketPrice * 10);
        if (rank == 4) return (0, 3, 64, ticketPrice * 50);
        return (0, 4, 300, type(uint256).max);
    }
    /// @notice Lifetime gross income credited to `account`: current balance plus everything withdrawn.
    function lifetimeEarned(address account) external view returns (uint256) {
        return claimable[account] + totalWithdrawnGross[account];
    }
    function directReferralCount(address account) external view returns (uint256) { return directList[account].length; }
    /// @notice Direct referrals of `account` in join order, paged.
    function getDirectReferrals(address account, uint256 offset, uint256 limit) external view returns (address[] memory page) {
        address[] storage list = directList[account];
        if (offset >= list.length) return page;
        uint256 end = offset + limit > list.length ? list.length : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) page[i - offset] = list[i];
    }
    function workingLevelQuote(uint8 level)
        external view returns (uint256 team, uint256 idAmount, uint256 turnover, uint256 autoUpgrade, uint256 distributable)
    {
        if (level == 0 || level > MAX_WORKING_LEVEL) revert InvalidLevel(level);
        team = uint256(level) * 2;
        idAmount = _workingIdAmount(level) * tokenUnit;
        turnover = team * idAmount;
        autoUpgrade = level < MAX_WORKING_LEVEL ? _workingIdAmount(level + 1) * tokenUnit : 0;
        distributable = turnover - autoUpgrade;
    }
    function nonWorkingLevelQuote(uint8 level)
        external view returns (uint256 team, uint256 idAmount, uint256 turnover, uint256 autoUpgrade, uint256 distributable)
    {
        if (level == 0 || level > 15) revert InvalidLevel(level);
        team = uint256(level) * 2;
        idAmount = _nonWorkingIdAmount(level) * tokenUnit;
        turnover = team * idAmount;
        autoUpgrade = level < 15 ? _nonWorkingIdAmount(level + 1) * tokenUnit : 0;
        distributable = turnover - autoUpgrade;
    }
    function singleLegQuote(uint8 level)
        external view returns (uint64 members, uint64 directs, uint256 income, uint256 extra, uint256 u1, uint256 u2)
    {
        if (level == 0 || level > 10) revert InvalidLevel(level);
        members = _singleLegMembers(level);
        directs = _singleLegDirects(level);
        income = _singleLegIncome(level) * tokenUnit;
        extra = _singleLegExtra(level) * tokenUnit;
        u1 = _singleLegUpline(level) * tokenUnit;
        u2 = u1;
    }
    function tenLevelPercentageBps(uint8 level) external pure returns (uint256) {
        if (level == 0 || level > 9) revert InvalidLevel(level);
        return _workingUplineBps(level - 1);
    }
    function withdrawable(address account) external view returns (uint256) {
        if (!royaltyClaimable(account)) return claimable[account];
        return claimable[account] + pendingFiveStarReward(account) + pendingClubReward(account) + heldRoyalty[account];
    }
    /// @notice Total directs needed to claim a star club's royalty: 0, 4, 8, 12, 16 for 1–5 Star.
    function clubClaimDirects(uint8 rank) public pure returns (uint64) {
        return rank <= 1 ? 0 : CLUB_CLAIM_DIRECTS_STEP * (rank - 1);
    }
    /// @notice Whether the account may claim royalty from its current club; otherwise it is held.
    function royaltyClaimable(address account) public view returns (bool) {
        return participants[account].directCount >= clubClaimDirects(starRank[account]);
    }
    function getParticipant(address account) external view returns (Participant memory) { return participants[account]; }
    function isRegistered(address account) external view returns (bool) { return participants[account].id != 0; }
    function isActive(address account) external view returns (bool) { return participants[account].directCount >= 2; }
    function currentWeek() public view returns (uint256) { return block.timestamp / WEEK; }
    function accountingInvariantHolds() external view returns (bool) {
        return totalParticipated == totalWorkingAllocated + totalNonWorkingAllocated + totalClubAllocated;
    }
    function solvencyInvariantHolds() external view returns (bool) {
        uint256 outstandingClaims = totalGrossRewards - totalClaimedGross;
        return paymentToken.balanceOf(address(this))
            >= outstandingClaims + workingReserve + singleLegReserve + nonWorkingReserve + superstarReserve
                + fiveStarLiability + clubLiability + heldRoyaltyLiability;
    }

    function _recordTeamGrowth(address account) private {
        for (uint8 depth; depth < MAX_UPLINE && account != address(0); ++depth) {
            uint64 newTeam = ++teamCount[account];
            _updateRank(account);
            _updateFiveStarWeight(account, newTeam);
            account = participants[account].sponsor;
        }
    }

    function _recordLevelTeam(address member) private {
        if (member == address(0) || levelTeamRecorded[member]) return;
        levelTeamRecorded[member] = true;
        address upline = participants[member].sponsor;
        for (uint8 level = 1; level <= MAX_WORKING_LEVEL && upline != address(0); ++level) {
            levelTeamCount[upline][level]++;
            upline = participants[upline].sponsor;
        }
    }

    /// @dev Self-funding auto-upgrade matrix (Working Pool and Non-Working Pool tables). An entry into `level`
    /// fills one position in the matrix of the nearest upline currently filling that level; with no such
    /// upline the entry's ID amount stays in the reserve. Every payout is backed by entries already paid in.
    function _enterMatrix(address member, bool working, uint8 level) private {
        address host = participants[member].sponsor;
        for (uint8 depth; depth < MAX_WORKING_LEVEL && host != address(0); ++depth) {
            if ((working ? workingLevel[host] : nonWorkingLevel[host]) + 1 == level) {
                emit LevelEntered(member, host, working, level);
                if (++matrixFilled[host][working ? level : level + 16] == level * 2) _completeLevel(host, working, level);
                return;
            }
            host = participants[host].sponsor;
        }
        emit LevelEntered(member, address(0), working, level);
    }

    /// @dev Completing a level: its turnover (2 × L × ID) minus the auto-upgrade is split 80% / 10% U1 /
    /// 10% U2–U9, and the auto-upgrade (next level's ID) enters the member into the next level.
    /// Working Level 1 is paid through the directs themselves, so it queues nothing.
    function _completeLevel(address account, bool working, uint8 level) private {
        if (working) {
            workingLevel[account] = level;
            if (level > 1) _queueWorkingLevel(account, level);
        } else {
            nonWorkingLevel[account] = level;
            _queueNonWorkingLevel(account, level);
        }
        emit LevelAdvanced(account, workingLevel[account], nonWorkingLevel[account]);
        if (level < MAX_WORKING_LEVEL) _enterMatrix(account, working, level + 1);
    }

    function _recordDirect(address member) private {
        if (member == address(0) || directListed[member]) return;
        directListed[member] = true;
        address sponsor = participants[member].sponsor;
        if (sponsor != address(0)) directList[sponsor].push(member);
    }

    function _updateRank(address account) private {
        uint64 directs = participants[account].directCount;
        uint8 next = participants[account].id == 0 ? 0 : 1;
        if (next != 0) {
            for (uint8 rank = 5; rank >= 2; --rank) {
                (uint64 needDirects, uint8 level, uint64 needTeam, ) = rankRule(rank);
                if (directs >= needDirects && (level == 0 || levelTeamCount[account][level] >= needTeam)) {
                    next = rank;
                    break;
                }
            }
        }
        uint8 previous = starRank[account];
        if (next <= previous) return;
        // Settle royalty earned in the old club under the old rank's claim rule, then move clubs.
        _settleClub(account);
        starRank[account] = next;
        _syncClub(account);
        if (next == 5) {
            fiveStarWeight[account] = 1;
            totalFiveStarWeight++;
            fiveStarRewardDebt[account] = accFiveStarRewardPerMember;
            fiveStarCount++;
            emit FiveStarWeightAdvanced(account, 1);
        }
        emit RankAdvanced(account, previous, next);
    }

    function _allocateWorking(address sponsor) private {
        if (participants[sponsor].directCount == UPGRADE_DIRECT) {
            autoUpgradeCredit[sponsor] += workingAllocation;
            workingReserve += workingAllocation;
            _completeLevel(sponsor, true, 1);
            return;
        }
        uint256 directAmount = workingAllocation * 8_000 / BPS;
        _credit(sponsor, directAmount, keccak256("DIRECT_INCOME"));

        address upline = participants[sponsor].sponsor;
        uint256 allocated = directAmount;
        for (uint8 level; level < MAX_WORKING_UPLINE; ++level) {
            uint256 amount = workingAllocation * _workingUplineBps(level) / BPS;
            allocated += amount;
            if (upline != address(0) && participants[upline].directCount >= 2) {
                _credit(upline, amount, keccak256("TEN_LEVEL_UPLINE"));
            } else {
                workingReserve += amount;
            }
            if (upline != address(0)) upline = participants[upline].sponsor;
        }
        workingReserve += workingAllocation - allocated;
    }

    function _queueWorkingLevel(address account, uint8 level) private {
        uint256 idAmount = _workingIdAmount(level) * tokenUnit;
        uint256 turnover = uint256(level * 2) * idAmount;
        uint256 upgrade = level < MAX_WORKING_LEVEL ? _workingIdAmount(level + 1) * tokenUnit : 0;
        workingAutoUpgradeConsumed += upgrade;
        uint256 distributable = turnover - upgrade;
        _queueTableDistribution(account, distributable, true, level);
    }

    function _queueNonWorkingLevel(address account, uint8 level) private {
        uint256 idAmount = _nonWorkingIdAmount(level) * tokenUnit;
        uint256 turnover = uint256(level * 2) * idAmount;
        uint256 upgrade = level < 15 ? _nonWorkingIdAmount(level + 1) * tokenUnit : 0;
        nonWorkingAutoUpgradeConsumed += upgrade;
        uint256 distributable = turnover - upgrade;
        _queueTableDistribution(account, distributable, false, level);
    }

    function _queueTableDistribution(address account, uint256 amount, bool working, uint8 level) private {
        uint256 participantAmount = amount * 8_000 / BPS;
        uint256 u1Amount = amount * 1_000 / BPS;
        uint256 upperAmount = amount - participantAmount - u1Amount;
        if (working) pendingWorkingPoolIncome[account] += participantAmount;
        else pendingNonWorkingPoolIncome[account] += participantAmount;

        address upline = participants[account].sponsor;
        if (_eligibleUpline(upline)) {
            if (working) pendingWorkingPoolIncome[upline] += u1Amount;
            else pendingNonWorkingPoolIncome[upline] += u1Amount;
        }
        if (upline != address(0)) upline = participants[upline].sponsor;

        uint256 share = upperAmount / 8;
        for (uint8 i; i < 8 && upline != address(0); ++i) {
            if (_eligibleUpline(upline)) {
                if (working) pendingWorkingPoolIncome[upline] += share;
                else pendingNonWorkingPoolIncome[upline] += share;
            }
            upline = participants[upline].sponsor;
        }
        emit PoolIncomeQueued(account, working ? 2 : 3, level, amount);
    }

    /// @dev Before this upgrade positions equalled member ids; start the stored line from there.
    function _initLine() private {
        if (lineLength == 0) lineLength = memberCount;
    }
    function _lineLen() private view returns (uint64) {
        return lineLength == 0 ? memberCount : lineLength;
    }
    function _primaryOf(address account) private view returns (uint64) {
        uint64 position = primaryPosition[account];
        return position == 0 ? participants[account].id : position;
    }
    function _addToLine(address owner) private returns (uint64 position) {
        position = ++lineLength;
        lineOwner[position] = owner;
    }
    function _processOwner(address owner) private {
        _processPosition(_primaryOf(owner));
        uint64 reentry = reentryPosition[owner];
        if (reentry != 0) _processPosition(reentry);
    }
    /// @dev Checks every position whose team (positions after it) has just reached a level's size.
    /// @dev Level 1 counts every position after yours; Level L (L >= 2) counts positions after yours that
    /// reached Level L-1. That count never shrinks and is larger for earlier positions, so each level keeps a
    /// cursor: every position before lineCursor[L] already has enough qualified members after it.
    function _sweepLine() private {
        for (uint8 level = 1; level <= 10; ++level) {
            for (;;) {
                uint64 position = _cursor(level);
                if (position > lineLength) break;
                uint64 qualified = level == 1 ? lineLength - position
                    : singleLegReached[level - 1] - singleLegBehind[level] - (_levelOf(position) >= level - 1 ? 1 : 0);
                if (qualified < _singleLegMembers(level)) break;
                lineCursor[level] = position + 1;
                if (level > 1 && _levelOf(position) >= level - 1) singleLegBehind[level]++;
                _processPosition(position);
            }
        }
    }
    function _cursor(uint8 level) private view returns (uint64 position) {
        position = lineCursor[level];
        if (position == 0) position = 1;
    }
    function _levelOf(uint64 position) private view returns (uint8) {
        address owner = lineOwnerAt(position);
        return position == _primaryOf(owner) ? singleLegLevel[owner] : reentryLevel[owner];
    }

    /// @dev Single-Leg Pool (Hybrid) table for one position. "Your income" goes to the owner; on the first
    /// position, Level 1 also redirects $5 into the Non-Working pool and Level 3 adds a re-entry position
    /// at the end of the line, which climbs the levels and pays again.
    function _processPosition(uint64 position) private {
        address account = lineOwnerAt(position);
        if (account == address(0)) return;
        bool primary = position == _primaryOf(account);
        uint8 level = (primary ? singleLegLevel[account] : reentryLevel[account]) + 1;
        while (
            level <= 10 && position < _cursor(level)
                && participants[account].directCount >= _singleLegDirects(level)
        ) {
            uint256 ownAmount = _singleLegIncome(level) * tokenUnit;
            if (primary && level == 3) {
                singleLegReentries[account]++;
                singleLegEntries[account]++;
                reentryPosition[account] = _addToLine(account);
                emit SingleLegReentered(account, singleLegEntries[account], _singleLegExtra(level) * tokenUnit);
            }
            pendingSingleLegIncome[account] += ownAmount;
            address u1 = participants[account].sponsor;
            address u2 = u1 == address(0) ? address(0) : participants[u1].sponsor;
            uint256 uplineAmount = _singleLegUpline(level) * tokenUnit;
            if (_eligibleUpline(u1)) pendingSingleLegIncome[u1] += uplineAmount;
            if (_eligibleUpline(u2)) pendingSingleLegIncome[u2] += uplineAmount;
            if (primary) singleLegLevel[account] = level;
            else reentryLevel[account] = level;
            // This position now counts for Level `level + 1` of every position before it.
            singleLegReached[level]++;
            if (level < 10 && position < _cursor(level + 1)) singleLegBehind[level + 1]++;
            emit PoolIncomeQueued(account, 1, level, ownAmount + 2 * uplineAmount);
            unchecked { ++level; }
        }
    }

    function _settleSingleLegBacked(address account, uint256 capacity) private returns (uint256 amount) {
        amount = pendingSingleLegIncome[account];
        if (amount > singleLegReserve || amount > capacity) return 0;
        pendingSingleLegIncome[account] -= amount;
        singleLegReserve -= amount;
    }

    function _settleWorkingBacked(
        mapping(address => uint256) storage pending,
        address account,
        uint256 capacity
    ) private returns (uint256 amount) {
        amount = pending[account];
        if (amount > workingReserve || amount > capacity) return 0;
        pending[account] -= amount;
        workingReserve -= amount;
    }

    function _settleNonWorkingBacked(address account, uint256 capacity) private returns (uint256 amount) {
        amount = pendingNonWorkingPoolIncome[account];
        if (amount > nonWorkingReserve || amount > capacity) return 0;
        pendingNonWorkingPoolIncome[account] -= amount;
        nonWorkingReserve -= amount;
    }

    function _updateFiveStarWeight(address account, uint64 team) private {
        if (starRank[account] != 5 || team <= 1_000 || team % 1_000 != 0) return;
        _settleFiveStar(account);
        fiveStarWeight[account]++;
        totalFiveStarWeight++;
        fiveStarRewardDebt[account] += accFiveStarRewardPerMember;
        emit FiveStarWeightAdvanced(account, fiveStarWeight[account]);
    }

    function _eligibleUpline(address account) private view returns (bool) {
        return account != address(0) && participants[account].directCount >= 2;
    }

    function _workingUplineBps(uint8 level) private pure returns (uint256) {
        if (level == 0) return 1_000;
        if (level == 1) return 400;
        if (level == 2) return 200;
        return 50;
    }

    function _workingIdAmount(uint8 level) private pure returns (uint256) {
        if (level <= 2) return 15;
        return 15 * (2 ** (level - 2));
    }

    function _nonWorkingIdAmount(uint8 level) private pure returns (uint256) {
        if (level <= 2) return 5;
        return 5 * (2 ** (level - 2));
    }

    /// @dev Members needed after your position (Team column): Level 1 counts everyone after you; Level L
    /// counts those who reached Level L-1.
    function _singleLegMembers(uint8 level) private pure returns (uint64) {
        if (level == 1) return 10;
        if (level == 2) return 15;
        if (level == 3) return 30;
        if (level == 4) return 60;
        if (level == 5) return 250;
        if (level == 6) return 600;
        if (level == 7) return 1_000;
        if (level == 8) return 1_500;
        if (level == 9) return 2_500;
        return 3_700;
    }

    /// @dev Total directs for a Single-Leg level: the table's per-level directs (1,1,1,2,3,3,3,3,4,4) added up.
    function _singleLegDirects(uint8 level) private pure returns (uint64) {
        if (level <= 3) return level;
        if (level == 4) return 5;
        if (level <= 8) return 8 + 3 * uint64(level - 5);
        return level == 9 ? 21 : 25;
    }

    function _singleLegIncome(uint8 level) private pure returns (uint256) {
        if (level == 1) return 6;
        if (level == 2) return 15;
        if (level == 3) return 35;
        if (level == 4) return 50;
        if (level == 5) return 150;
        if (level == 6) return 500;
        if (level == 7) return 1_500;
        if (level == 8) return 3_500;
        if (level == 9) return 10_000;
        return 15_000;
    }

    /// @dev "Global pool + re-entry" column: Level 1 funds the Non-Working pool, Level 3 is the re-entry.
    function _singleLegExtra(uint8 level) private pure returns (uint256) {
        if (level == 3) return 9;
        return 0;
    }

    function _singleLegUpline(uint8 level) private pure returns (uint256) {
        if (level == 1) return 1;
        if (level == 2) return 2;
        if (level == 3) return 3;
        if (level == 4) return 5;
        if (level == 5) return 10;
        if (level == 6) return 30;
        if (level == 7) return 100;
        if (level == 8) return 400;
        if (level == 9) return 1_000;
        return 2_500;
    }

    function _recordWeeklyDirect(address sponsor) private {
        uint256 week = currentWeek();
        uint64 count = ++weeklyDirects[week][sponsor];
        WeeklyCompetition storage competition = weeklyCompetition[week];
        if (count > competition.winningDirects) {
            competition.leader = sponsor;
            competition.winningDirects = count;
        }
    }
    function _settleFiveStar(address account) private {
        if (starRank[account] != 5) return;
        uint256 amount = pendingFiveStarReward(account);
        fiveStarRewardDebt[account] += amount * ACC;
        fiveStarLiability -= amount;
        _creditOrHoldRoyalty(account, amount, keccak256("FIVE_STAR_ROYALTY"));
    }
    /// @dev Splits the withdrawal royalty equally across the five star clubs. A club with
    /// no members forwards its share to the club vault, as the 5 Star club always has.
    function _distributeRoyalty(uint256 royalty) private {
        if (royalty == 0) return;
        uint256 share = royalty / STAR_CLUBS;
        uint256 toVault;
        for (uint8 club = 1; club < STAR_CLUBS; ++club) {
            uint64 members = clubMemberCount[club];
            if (members == 0) {
                toVault += share;
            } else {
                clubLiability += share;
                accClubRewardPerMember[club] += share * ACC / members;
            }
            emit ClubRoyaltyDistributed(club, share, members);
        }
        uint256 fiveStarShare = royalty - share * (STAR_CLUBS - 1);
        emit ClubRoyaltyDistributed(STAR_CLUBS, fiveStarShare, fiveStarCount);
        if (toVault > 0) paymentToken.safeTransfer(fiveStarClub, toVault);
        _distributeFiveStarOrVault(fiveStarShare);
    }
    /// @dev Moves an account into the 1–4 Star club matching its rank, settling any royalty earned in its previous club.
    function _syncClub(address account) private {
        if (account == address(0)) return;
        uint8 current = clubRank[account];
        uint8 target = participants[account].id == 0 ? 0 : starRank[account];
        if (target >= STAR_CLUBS) target = 0;
        if (current == target) return;
        if (current != 0) {
            _settleClub(account);
            clubMemberCount[current]--;
        }
        clubRank[account] = target;
        if (target != 0) {
            clubMemberCount[target]++;
            clubRewardDebt[account] = accClubRewardPerMember[target];
        }
        emit ClubMembershipChanged(account, current, target);
    }
    function _settleClub(address account) private {
        uint256 amount = pendingClubReward(account);
        if (amount == 0) return;
        clubRewardDebt[account] += amount * ACC;
        clubLiability -= amount;
        _creditOrHoldRoyalty(account, amount, keccak256("STAR_CLUB_ROYALTY"));
    }
    function _creditOrHoldRoyalty(address account, uint256 amount, bytes32 reason) private {
        if (amount == 0) return;
        if (royaltyClaimable(account)) {
            _credit(account, amount, reason);
        } else {
            heldRoyalty[account] += amount;
            heldRoyaltyLiability += amount;
        }
    }
    function _releaseHeldRoyalty(address account) private {
        uint256 amount = heldRoyalty[account];
        if (amount == 0 || !royaltyClaimable(account)) return;
        heldRoyalty[account] = 0;
        heldRoyaltyLiability -= amount;
        _credit(account, amount, keccak256("STAR_CLUB_ROYALTY"));
    }
    function _distributeFiveStarOrVault(uint256 amount) private {
        if (amount == 0) return;
        if (fiveStarCount == 0) paymentToken.safeTransfer(fiveStarClub, amount);
        else {
            fiveStarLiability += amount;
            accFiveStarRewardPerMember += amount * ACC / totalFiveStarWeight;
        }
    }
    function _credit(address account, uint256 amount, bytes32 reason) private {
        if (amount == 0) return;
        claimable[account] += amount;
        totalGrossRewards += amount;
        incomeByReason[account][reason] += amount;
        incomeCountByReason[account][reason]++;
        emit RewardCredited(account, amount, reason);
    }
    function _receiveExact(address from, uint256 amount) private {
        uint256 beforeBalance = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(from, address(this), amount);
        uint256 received = paymentToken.balanceOf(address(this)) - beforeBalance;
        if (received != amount) revert IncorrectTokenReceipt(address(this), amount, received);
    }
}
