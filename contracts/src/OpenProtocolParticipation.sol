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
    /// @notice "Your first direct referral helps you upgrade": the 80% share of this many first directs is
    /// reserved for the upgrade; every later direct pays it to the sponsor as direct income.
    uint64 public constant RESERVED_DIRECTS = 1;
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
    mapping(address => uint64) public nonWorkingTeamCount;

    // ---- Appended in the global Single-Leg line upgrade (uses 6 gap slots). ----
    /// @notice Single-Leg is one global line, first come first served. Each registration and each
    /// Level 3 re-entry adds a position; a position's team is every position after it.
    uint64 public lineLength;
    mapping(uint64 => address) internal lineOwner;
    mapping(address => uint64) internal primaryPosition;
    mapping(address => uint64) public reentryPosition;
    mapping(address => uint8) public reentryLevel;
    /// @dev Per Single-Leg level, the next position to check for reaching that level's team size.
    mapping(uint8 => uint64) internal lineCursor;

    // Storage reserved for future implementations. New state must be appended here
    // and the gap reduced by the same number of slots.
    uint256[28] private __gap;

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
        ticketPrice = 25 * unit;
        workingAllocation = 15 * unit;
        nonWorkingAllocation = 9 * unit;
        clubAllocation = unit;
        memberCount = 1;
        participants[genesisParticipant_] = Participant(1, 0, address(0), uint64(block.timestamp));
        starRank[genesisParticipant_] = 1;
        _syncClub(genesisParticipant_);
        singleLegEntries[genesisParticipant_] = 1;
        memberById[1] = genesisParticipant_;
        emit ParticipantRegistered(genesisParticipant_, address(0), 1, uint64(block.timestamp));
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function register(address sponsor) external nonReentrant {
        if (participants[msg.sender].id != 0) revert AlreadyRegistered(msg.sender);
        if (sponsor == msg.sender) revert SelfSponsorship();
        if (participants[sponsor].id == 0) revert SponsorNotRegistered(sponsor);
        _receiveExact(msg.sender, ticketPrice);

        bool sponsorWasActive = participants[sponsor].directCount >= RESERVED_DIRECTS;
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
        totalNonWorkingAllocated += nonWorkingAllocation;
        totalClubAllocated += clubAllocation;
        _allocateWorking(sponsor, sponsorWasActive);
        singleLegReserve += nonWorkingAllocation;
        _fundPendingNonWorkingRedirect();
        superstarReserve += clubAllocation;
        emit ParticipantRegistered(msg.sender, sponsor, newId, uint64(block.timestamp));
        emit RankAdvanced(msg.sender, 0, 1);
        emit ParticipationAllocated(msg.sender, workingAllocation, nonWorkingAllocation, clubAllocation);
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
    /// @notice Enrols existing members (by id range) into the 1–4 Star club matching their rank.
    /// Idempotent and permissionless; run once over all ids after upgrading a live proxy.
    function syncClubMembers(uint64 fromId, uint64 toId) external nonReentrant {
        if (toId > memberCount) toId = memberCount;
        for (uint64 id = fromId == 0 ? 1 : fromId; id <= toId; ++id) _syncClub(memberById[id]);
    }
    /// @notice Team size at each of the 10 sponsor levels below `account` (index 0 = level 1 = directs).
    function getLevelTeamCounts(address account) external view returns (uint64[10] memory counts) {
        for (uint8 level = 1; level <= MAX_UPLINE; ++level) counts[level - 1] = levelTeamCount[account][level];
    }
    /// @notice Adds members registered before per-level counting to their uplines' counts.
    /// Idempotent and permissionless; run once over all ids after upgrading a live proxy.
    function syncLevelTeam(uint64 fromId, uint64 toId) external nonReentrant {
        if (toId > memberCount) toId = memberCount;
        for (uint64 id = fromId == 0 ? 1 : fromId; id <= toId; ++id) _recordLevelTeam(memberById[id]);
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
    /// @notice Adds members registered before on-chain referral lists to their sponsor's list.
    /// Idempotent and permissionless; run once over all ids, in id order, after upgrading.
    function syncDirectList(uint64 fromId, uint64 toId) external nonReentrant {
        if (toId > memberCount) toId = memberCount;
        for (uint64 id = fromId == 0 ? 1 : fromId; id <= toId; ++id) _recordDirect(memberById[id]);
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
            if (newTeam % 30 == 0) _reenter(account, false);
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
            _advanceWorking(upline);
            upline = participants[upline].sponsor;
        }
    }

    /// @dev Working level L is reached, in order, once the member has 2×L members at referral depth L.
    /// Each level queues its Working Pool table income: 80% achiever, 10% U1, 10% across U2–U9.
    function _advanceWorking(address account) private {
        uint8 level = workingLevel[account];
        while (level < MAX_WORKING_LEVEL && levelTeamCount[account][level + 1] >= uint64(level + 1) * 2) {
            ++level;
            _queueWorkingLevel(account, level);
        }
        if (level == workingLevel[account]) return;
        workingLevel[account] = level;
        emit LevelAdvanced(account, level, nonWorkingLevel[account]);
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

    function _reenter(address account, bool working) private {
        uint256 reward;
        uint64 cycle;
        if (working) {
            cycle = ++workingReentries[account];
            if (workingReserve >= workingAllocation) { reward = workingAllocation; workingReserve -= reward; }
        } else {
            cycle = ++nonWorkingReentries[account];
            if (nonWorkingReserve >= nonWorkingAllocation) { reward = nonWorkingAllocation; nonWorkingReserve -= reward; }
        }
        _credit(account, reward, keccak256("REENTRY"));
        emit Reentered(account, working, cycle, reward);
    }

    function _allocateWorking(address sponsor, bool sponsorWasActive) private {
        uint256 directAmount = workingAllocation * 8_000 / BPS;
        if (sponsorWasActive) _credit(sponsor, directAmount, keccak256("DIRECT_INCOME"));
        else { autoUpgradeCredit[sponsor] += directAmount; workingReserve += directAmount; }

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
    function _sweepLine() private {
        for (uint8 level = 1; level <= 10; ++level) {
            uint64 cursor = lineCursor[level];
            if (cursor == 0) cursor = 1;
            while (cursor + _singleLegMembers(level) <= lineLength) _processPosition(cursor++);
            lineCursor[level] = cursor;
        }
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
            level <= 10 && lineLength - position >= _singleLegMembers(level)
                && participants[account].directCount >= _singleLegDirects(level)
        ) {
            uint256 ownAmount = _singleLegIncome(level) * tokenUnit;
            if (primary && level == 1) {
                uint256 redirect = _singleLegExtra(level) * tokenUnit;
                pendingNonWorkingRedirect += redirect;
                nonWorkingEntryCredit[account] += redirect;
                emit NonWorkingEntryFunded(account, redirect);
                _enterNonWorking(account);
            } else if (primary && level == 3) {
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
            emit PoolIncomeQueued(account, 1, level, ownAmount + 2 * uplineAmount);
            unchecked { ++level; }
        }
    }

    /// @dev Reaching Single-Leg Level 1 enters the Non-Working matrix: the member fills a position for
    /// each of their 10 uplines, and their own Non-Working levels (already filled by others) catch up.
    function _enterNonWorking(address member) private {
        _advanceNonWorking(member);
        address upline = participants[member].sponsor;
        for (uint8 depth; depth < MAX_UPLINE && upline != address(0); ++depth) {
            nonWorkingTeamCount[upline]++;
            _advanceNonWorking(upline);
            upline = participants[upline].sponsor;
        }
    }

    /// @dev Non-Working level = entered team / 2 (max 15); income is queued only once the member has entered.
    function _advanceNonWorking(address account) private {
        if (nonWorkingEntryCredit[account] == 0) return;
        uint64 entered = nonWorkingTeamCount[account];
        uint8 newLevel = uint8(entered / 2 > 15 ? 15 : entered / 2);
        uint8 oldLevel = nonWorkingLevel[account];
        if (newLevel <= oldLevel) return;
        for (uint8 level = oldLevel + 1; level <= newLevel; ++level) _queueNonWorkingLevel(account, level);
        nonWorkingLevel[account] = newLevel;
        emit LevelAdvanced(account, workingLevel[account], newLevel);
    }

    function _fundPendingNonWorkingRedirect() private {
        uint256 amount = pendingNonWorkingRedirect;
        if (amount > singleLegReserve) amount = singleLegReserve;
        if (amount == 0) return;
        pendingNonWorkingRedirect -= amount;
        singleLegReserve -= amount;
        nonWorkingReserve += amount;
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

    /// @dev Total positions needed after yours: the table's per-level team (10, 15, 30, 60, 250, 600,
    /// 1,000, 1,500, 2,500, 3,700) added up.
    function _singleLegMembers(uint8 level) private pure returns (uint64) {
        if (level == 1) return 10;
        if (level == 2) return 25;
        if (level == 3) return 55;
        if (level == 4) return 115;
        if (level == 5) return 365;
        if (level == 6) return 965;
        if (level == 7) return 1_965;
        if (level == 8) return 3_465;
        if (level == 9) return 5_965;
        return 9_665;
    }

    /// @dev Total directs for a Single-Leg level: the table's per-level directs (1,1,1,2,3,3,3,3,4,4) added up.
    function _singleLegDirects(uint8 level) private pure returns (uint64) {
        if (level <= 3) return level;
        if (level == 4) return 5;
        if (level <= 8) return 8 + 3 * uint64(level - 5);
        return level == 9 ? 21 : 25;
    }

    function _singleLegIncome(uint8 level) private pure returns (uint256) {
        if (level == 1) return 11;
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
        if (level == 1) return 5;
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
