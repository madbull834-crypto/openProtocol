// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Testnet reference implementation. Assumptions are documented in REQUIREMENTS.md.
contract OpenProtocolParticipation is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 private constant BPS = 10_000;
    uint256 private constant ACC = 1e24;
    uint256 private constant WEEK = 7 days;
    uint8 private constant MAX_UPLINE = 10;

    struct Participant { uint64 id; uint64 directCount; address sponsor; uint64 joinedAt; }
    struct WeeklyCompetition { address leader; uint64 winningDirects; bool closed; }

    error ZeroAddress();
    error DuplicatePoolRecipient();
    error UnsupportedTokenDecimals(uint8 decimals);
    error AlreadyRegistered(address account);
    error SponsorNotRegistered(address sponsor);
    error SelfSponsorship();
    error IncorrectTokenReceipt(address recipient, uint256 expected, uint256 received);
    error NothingToClaim();
    error WeekNotFinished(uint256 week);
    error WeekAlreadyClosed(uint256 week);
    error InvalidLevel(uint8 level);

    IERC20 public immutable paymentToken;
    address public immutable workingPool;
    address public immutable nonWorkingPool;
    address public immutable fiveStarClub;
    address public immutable developmentFund;
    uint256 public immutable ticketPrice;
    uint256 public immutable tokenUnit;
    uint256 public immutable workingAllocation;
    uint256 public immutable nonWorkingAllocation;
    uint256 public immutable clubAllocation;

    uint64 public memberCount;
    uint64 public matrixCursor;
    uint64 public fiveStarCount;
    uint256 public totalParticipated;
    uint256 public totalWorkingAllocated;
    uint256 public totalNonWorkingAllocated;
    uint256 public totalClubAllocated;
    uint256 public totalGrossRewards;
    uint256 public totalClaimedGross;
    uint256 public workingReserve;
    uint256 public nonWorkingReserve;
    uint256 public clubReserve;
    uint256 public fiveStarLiability;
    uint256 public accFiveStarRewardPerMember;
    uint256 public totalFiveStarWeight;
    uint256 public workingAutoUpgradeConsumed;
    uint256 public nonWorkingAutoUpgradeConsumed;

    mapping(address => Participant) private participants;
    mapping(uint64 => address) public memberById;
    mapping(uint64 => address) public matrixQueue;
    mapping(address => address) public matrixParent;
    mapping(address => address[2]) private matrixChildren;
    mapping(address => uint64) public teamCount;
    mapping(address => uint8) public workingLevel;
    mapping(address => uint8) public nonWorkingLevel;
    mapping(address => uint8) public starRank;
    mapping(address => uint64) public workingReentries;
    mapping(address => uint64) public nonWorkingReentries;
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

    constructor(
        IERC20Metadata token_,
        address workingPool_,
        address nonWorkingPool_,
        address fiveStarClub_,
        address developmentFund_,
        address genesisParticipant_
    ) {
        if (address(token_) == address(0) || workingPool_ == address(0) || nonWorkingPool_ == address(0)
            || fiveStarClub_ == address(0) || developmentFund_ == address(0) || genesisParticipant_ == address(0)) {
            revert ZeroAddress();
        }
        if (workingPool_ == nonWorkingPool_ || workingPool_ == fiveStarClub_ || nonWorkingPool_ == fiveStarClub_) {
            revert DuplicatePoolRecipient();
        }
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
        memberById[1] = genesisParticipant_;
        matrixQueue[0] = genesisParticipant_;
        emit ParticipantRegistered(genesisParticipant_, address(0), 1, uint64(block.timestamp));
    }

    function register(address sponsor) external nonReentrant {
        if (participants[msg.sender].id != 0) revert AlreadyRegistered(msg.sender);
        if (sponsor == msg.sender) revert SelfSponsorship();
        if (participants[sponsor].id == 0) revert SponsorNotRegistered(sponsor);
        _receiveExact(msg.sender, ticketPrice);

        bool sponsorWasActive = participants[sponsor].directCount >= 2;
        uint64 newId = ++memberCount;
        participants[msg.sender] = Participant(newId, 0, sponsor, uint64(block.timestamp));
        participants[sponsor].directCount++;
        memberById[newId] = msg.sender;
        _placeInMatrix(msg.sender, newId);
        _recordTeamGrowth(sponsor);
        _recordWeeklyDirect(sponsor);

        totalParticipated += ticketPrice;
        totalWorkingAllocated += workingAllocation;
        totalNonWorkingAllocated += nonWorkingAllocation;
        totalClubAllocated += clubAllocation;
        _allocateWorking(sponsor, sponsorWasActive);
        _allocateNonWorking(msg.sender, sponsor);
        _allocateClub();
        emit ParticipantRegistered(msg.sender, sponsor, newId, uint64(block.timestamp));
        emit ParticipationAllocated(msg.sender, workingAllocation, nonWorkingAllocation, clubAllocation);
    }

    function claim() external nonReentrant {
        _settleFiveStar(msg.sender);
        uint256 gross = claimable[msg.sender];
        if (gross == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalClaimedGross += gross;
        uint256 royalty = gross * 1_700 / BPS;
        uint256 development = gross * 300 / BPS;
        uint256 net = gross - royalty - development;
        paymentToken.safeTransfer(msg.sender, net);
        paymentToken.safeTransfer(developmentFund, development);
        _distributeFiveStarOrVault(royalty);
        emit Claimed(msg.sender, gross, net, royalty, development);
    }

    function closeWeek(uint256 week) external nonReentrant {
        if (week >= currentWeek()) revert WeekNotFinished(week);
        WeeklyCompetition storage competition = weeklyCompetition[week];
        if (competition.closed) revert WeekAlreadyClosed(week);
        competition.closed = true;
        uint256 reward;
        if (competition.leader != address(0)) {
            reward = workingReserve / 10;
            workingReserve -= reward;
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
    function settlePoolRewards() external nonReentrant {
        uint256 cap = poolRewardCap(msg.sender);
        uint256 credited = rankedPoolRewardsCredited[msg.sender];
        uint256 capacity = cap == type(uint256).max ? type(uint256).max : cap > credited ? cap - credited : 0;

        uint256 singleAmount = _settleWorkingBacked(pendingSingleLegIncome, msg.sender, capacity);
        capacity = capacity == type(uint256).max ? capacity : capacity - singleAmount;
        uint256 workingAmount = _settleWorkingBacked(pendingWorkingPoolIncome, msg.sender, capacity);
        capacity = capacity == type(uint256).max ? capacity : capacity - workingAmount;
        uint256 nonWorkingAmount = _settleNonWorkingBacked(msg.sender, capacity);
        uint256 total = singleAmount + workingAmount + nonWorkingAmount;
        rankedPoolRewardsCredited[msg.sender] += total;
        _credit(msg.sender, total, keccak256("POOL_LEVEL_INCOME"));
        emit PoolIncomeSettled(msg.sender, singleAmount, workingAmount, nonWorkingAmount);
    }
    function poolRewardCap(address account) public view returns (uint256) {
        uint8 rank = starRank[account];
        if (rank >= 4) return type(uint256).max;
        if (rank == 3) return ticketPrice * 50;
        if (rank == 2) return ticketPrice * 10;
        if (rank == 1) return ticketPrice * 5;
        return ticketPrice * 2;
    }
    function workingLevelQuote(uint8 level)
        external view returns (uint256 team, uint256 idAmount, uint256 turnover, uint256 autoUpgrade, uint256 distributable)
    {
        if (level == 0 || level > 8) revert InvalidLevel(level);
        team = uint256(level) * 2;
        idAmount = _workingIdAmount(level) * tokenUnit;
        turnover = team * idAmount;
        autoUpgrade = level < 8 ? _workingIdAmount(level + 1) * tokenUnit : 0;
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
        if (level == 0 || level > 10) revert InvalidLevel(level);
        return _workingUplineBps(level - 1);
    }
    function withdrawable(address account) external view returns (uint256) {
        return claimable[account] + pendingFiveStarReward(account);
    }
    function getParticipant(address account) external view returns (Participant memory) { return participants[account]; }
    function getMatrixChildren(address account) external view returns (address[2] memory) { return matrixChildren[account]; }
    function isRegistered(address account) external view returns (bool) { return participants[account].id != 0; }
    function isActive(address account) external view returns (bool) { return participants[account].directCount >= 2; }
    function currentWeek() public view returns (uint256) { return block.timestamp / WEEK; }
    function accountingInvariantHolds() external view returns (bool) {
        return totalParticipated == totalWorkingAllocated + totalNonWorkingAllocated + totalClubAllocated;
    }
    function solvencyInvariantHolds() external view returns (bool) {
        uint256 outstandingClaims = totalGrossRewards - totalClaimedGross;
        return paymentToken.balanceOf(address(this))
            >= outstandingClaims + workingReserve + nonWorkingReserve + clubReserve + fiveStarLiability;
    }

    function _placeInMatrix(address account, uint64 position) private {
        address parent = matrixQueue[matrixCursor];
        address[2] storage children = matrixChildren[parent];
        if (children[0] == address(0)) children[0] = account;
        else { children[1] = account; matrixCursor++; }
        matrixParent[account] = parent;
        matrixQueue[position - 1] = account;
        emit MatrixPlaced(account, parent, position - 1);
    }

    function _recordTeamGrowth(address account) private {
        for (uint8 depth; depth < MAX_UPLINE && account != address(0); ++depth) {
            uint64 newTeam = ++teamCount[account];
            uint8 oldWorking = workingLevel[account];
            uint8 oldNonWorking = nonWorkingLevel[account];
            uint8 newWorking = uint8(newTeam / 2 > 8 ? 8 : newTeam / 2);
            uint8 newNonWorking = uint8(newTeam / 2 > 15 ? 15 : newTeam / 2);
            if (newWorking != oldWorking || newNonWorking != oldNonWorking) {
                for (uint8 level = oldWorking + 1; level <= newWorking; ++level) {
                    _queueWorkingLevel(account, level);
                }
                for (uint8 level = oldNonWorking + 1; level <= newNonWorking; ++level) {
                    _queueNonWorkingLevel(account, level);
                }
                workingLevel[account] = newWorking;
                nonWorkingLevel[account] = newNonWorking;
                emit LevelAdvanced(account, newWorking, newNonWorking);
            }
            if (newTeam % 16 == 0) _reenter(account, true);
            if (newTeam % 30 == 0) _reenter(account, false);
            _updateRank(account);
            _updateFiveStarWeight(account, newTeam);
            _processSingleLeg(account);
            account = participants[account].sponsor;
        }
    }

    function _updateRank(address account) private {
        uint64 directs = participants[account].directCount;
        uint64 team = teamCount[account];
        uint8 next;
        if (directs >= 4) next = 1;
        if (directs >= 8 && team >= 16) next = 2;
        if (directs >= 12 && team >= 64) next = 3;
        if (directs >= 16 && team >= 300) next = 4;
        if (directs >= 16 && team >= 1_000) next = 5;
        uint8 previous = starRank[account];
        if (next <= previous) return;
        starRank[account] = next;
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

        address upline = sponsor;
        uint256 allocated = directAmount;
        for (uint8 level; level < MAX_UPLINE; ++level) {
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

    function _allocateNonWorking(address account, address sponsor) private {
        uint256 matrixAmount = nonWorkingAllocation * 8_000 / BPS;
        uint256 u1Amount = nonWorkingAllocation * 1_000 / BPS;
        uint256 upperAmount = nonWorkingAllocation * 1_000 / BPS;
        address parent = matrixParent[account];
        if (parent == address(0)) nonWorkingReserve += matrixAmount;
        else _credit(parent, matrixAmount, keccak256("MATRIX_INCOME"));
        _credit(sponsor, u1Amount, keccak256("NONWORKING_U1"));
        nonWorkingReserve += _creditUpperUplines(participants[sponsor].sponsor, upperAmount, keccak256("NONWORKING_UPLINE"));
        nonWorkingReserve += nonWorkingAllocation - matrixAmount - u1Amount - upperAmount;
    }

    function _creditUpperUplines(address account, uint256 amount, bytes32 reason) private returns (uint256) {
        uint256 share = amount / 8;
        uint256 allocated;
        for (uint8 i; i < 8; ++i) {
            if (account == address(0)) break;
            _credit(account, share, reason);
            allocated += share;
            account = participants[account].sponsor;
        }
        return amount - allocated;
    }

    function _queueWorkingLevel(address account, uint8 level) private {
        uint256 idAmount = _workingIdAmount(level) * tokenUnit;
        uint256 turnover = uint256(level * 2) * idAmount;
        uint256 upgrade = level < 8 ? _workingIdAmount(level + 1) * tokenUnit : 0;
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

    function _processSingleLeg(address account) private {
        uint8 level = singleLegLevel[account] + 1;
        while (
            level <= 10 && teamCount[account] >= _singleLegMembers(level)
                && participants[account].directCount >= _singleLegDirects(level)
        ) {
            uint256 ownAmount = (_singleLegIncome(level) + _singleLegExtra(level)) * tokenUnit;
            pendingSingleLegIncome[account] += ownAmount;
            address u1 = participants[account].sponsor;
            address u2 = u1 == address(0) ? address(0) : participants[u1].sponsor;
            uint256 uplineAmount = _singleLegUpline(level) * tokenUnit;
            if (_eligibleUpline(u1)) pendingSingleLegIncome[u1] += uplineAmount;
            if (_eligibleUpline(u2)) pendingSingleLegIncome[u2] += uplineAmount;
            singleLegLevel[account] = level;
            emit PoolIncomeQueued(account, 1, level, ownAmount + 2 * uplineAmount);
            unchecked { ++level; }
        }
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

    function _singleLegDirects(uint8 level) private pure returns (uint64) {
        if (level <= 3) return 1;
        if (level <= 5) return 2;
        if (level <= 8) return 3;
        return 4;
    }

    function _singleLegIncome(uint8 level) private pure returns (uint256) {
        if (level == 1) return 10;
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

    function _allocateClub() private {
        if (fiveStarCount == 0) clubReserve += clubAllocation;
        else {
            uint256 amount = clubAllocation + clubReserve;
            clubReserve = 0;
            fiveStarLiability += amount;
            accFiveStarRewardPerMember += amount * ACC / totalFiveStarWeight;
        }
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
        _credit(account, amount, keccak256("FIVE_STAR_ROYALTY"));
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
        emit RewardCredited(account, amount, reason);
    }
    function _receiveExact(address from, uint256 amount) private {
        uint256 beforeBalance = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(from, address(this), amount);
        uint256 received = paymentToken.balanceOf(address(this)) - beforeBalance;
        if (received != amount) revert IncorrectTokenReceipt(address(this), amount, received);
    }
}
