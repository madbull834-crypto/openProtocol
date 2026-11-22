import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("OpenProtocolParticipation", function () {
  async function fixture() {
    const [genesis, alice, bob, carol, dave, working, nonWorking, club, development] = await ethers.getSigners();
    const token = await ethers.deployContract("MockUSDT");
    const factory = await ethers.getContractFactory("OpenProtocolParticipation");
    const protocol = await upgrades.deployProxy(factory, [
      await token.getAddress(), working.address, nonWorking.address, club.address, development.address, genesis.address,
    ], { initializer: "initialize", kind: "uups" });
    const ticket = 25_000_000n;
    for (const member of [alice, bob, carol, dave]) {
      await token.mint(member.address, ticket);
      await token.connect(member).approve(await protocol.getAddress(), ticket);
    }
    return { genesis, alice, bob, carol, dave, working, nonWorking, club, development, token, protocol, ticket };
  }

  async function addMembers(protocol: any, token: any, sponsor: string, count: number) {
    const members = [];
    for (let i = 0; i < count; i++) {
      const member = ethers.Wallet.createRandom().connect(ethers.provider);
      await ethers.provider.send("hardhat_setBalance", [member.address, "0x56BC75E2D63100000"]);
      await token.mint(member.address, 25_000_000n);
      await token.connect(member).approve(await protocol.getAddress(), 25_000_000n);
      await protocol.connect(member).register(sponsor);
      members.push(member);
    }
    return members;
  }

  it("creates genesis and atomically records a 25 USDT registration", async function () {
    const { genesis, alice, protocol, token, ticket } = await fixture();
    await expect(protocol.connect(alice).register(genesis.address))
      .to.emit(protocol, "ParticipationAllocated")
      .withArgs(alice.address, 15_000_000n, 9_000_000n, 1_000_000n);
    expect(await token.balanceOf(await protocol.getAddress())).to.equal(ticket);
    expect((await protocol.getParticipant(alice.address)).id).to.equal(2);
    expect(await protocol.totalParticipated()).to.equal(ticket);
    expect(await protocol.accountingInvariantHolds()).to.equal(true);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("places members in a deterministic breadth-first two-wide matrix", async function () {
    const { genesis, alice, bob, carol, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    await protocol.connect(carol).register(alice.address);
    expect(await protocol.getMatrixChildren(genesis.address)).to.deep.equal([alice.address, bob.address]);
    expect(await protocol.matrixParent(carol.address)).to.equal(alice.address);
  });

  it("uses the first two directs for activation and pays 12 USDT from the third", async function () {
    const { genesis, alice, bob, carol, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    expect(await protocol.isActive(genesis.address)).to.equal(true);
    expect(await protocol.autoUpgradeCredit(genesis.address)).to.equal(24_000_000n);
    const before = await protocol.claimable(genesis.address);
    await protocol.connect(carol).register(genesis.address);
    expect((await protocol.claimable(genesis.address)) - before).to.equal(12_000_000n);
    expect(await protocol.workingReserve()).to.equal(33_000_000n);
  });

  it("pays 10% to the sponsor's first upline after the 80% direct share", async function () {
    const { genesis, alice, bob, carol, dave, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    await protocol.connect(carol).register(alice.address);
    await protocol.connect(dave).register(alice.address);
    const genesisBefore = await protocol.claimable(genesis.address);
    const [third] = await addMembers(protocol, token, alice.address, 1);
    expect(third).to.not.equal(undefined);
    expect(await protocol.claimable(alice.address)).to.equal(12_000_000n);
    expect((await protocol.claimable(genesis.address)) - genesisBefore).to.equal(1_500_000n);
  });

  it("starts at one star and reaches two star with four directs", async function () {
    const { genesis, alice, bob, carol, dave, protocol } = await fixture();
    for (const member of [alice, bob, carol, dave]) await protocol.connect(member).register(genesis.address);
    expect(await protocol.teamCount(genesis.address)).to.equal(4);
    // Working Level 1 = 2 directs; Level 2 needs 4 members at depth 2, and there are none.
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    // Non-Working fills only with members who reached Single-Leg Level 1; nobody has yet.
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(0);
    expect(await protocol.starRank(genesis.address)).to.equal(2);
    expect(await protocol.starRank(alice.address)).to.equal(1);
  });

  it("reaches 3 Star with 4 directs and 16 members at referral level 2 (4+4)", async function () {
    const { genesis, protocol, token } = await fixture();
    const directs = await addMembers(protocol, token, genesis.address, 4);
    expect(await protocol.starRank(genesis.address)).to.equal(2);
    for (const [index, direct] of directs.entries()) {
      await addMembers(protocol, token, direct.address, 4);
      // 3 Star only once the 16th member lands on level 2.
      expect(await protocol.starRank(genesis.address)).to.equal(index === 3 ? 3 : 2);
    }
    expect((await protocol.getLevelTeamCounts(genesis.address)).slice(0, 2)).to.deep.equal([4n, 16n]);
    expect(await protocol.rankRule(4)).to.deep.equal([0n, 3n, 64n, 25_000_000n * 50n]);
    // Each direct has 4 directs of its own, so they are 2 Star.
    expect(await protocol.starRank(directs[0].address)).to.equal(2);
  });

  it("ranks 3 Star from level 2 alone but holds club royalty until 8 directs", async function () {
    const { genesis, alice, bob, carol, dave, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await addMembers(protocol, token, alice.address, 15);
    // While still 1 Star, genesis earns from the 1 Star club; that stays claimable after ranking up.
    await protocol.connect(alice).claim();
    const oneStarShare = await protocol.pendingClubReward(genesis.address);
    expect(oneStarShare).to.be.greaterThan(0n);
    await addMembers(protocol, token, alice.address, 1);
    expect(await protocol.claimable(genesis.address)).to.equal(oneStarShare);
    expect(await protocol.heldRoyalty(genesis.address)).to.equal(0n);
    // One direct, but all 16 level-2 members came through her: genesis is 3 Star.
    expect(await protocol.starRank(genesis.address)).to.equal(3);
    expect(await protocol.royaltyClaimable(genesis.address)).to.equal(false);

    await protocol.connect(alice).claim(); // funds every club with 3% of alice's new withdrawal
    const earned = await protocol.pendingClubReward(genesis.address);
    expect(earned).to.be.greaterThan(0n);
    expect(await protocol.withdrawable(genesis.address)).to.equal(await protocol.claimable(genesis.address));

    for (const member of [bob, carol, dave]) await protocol.connect(member).register(genesis.address);
    expect(await protocol.royaltyClaimable(genesis.address)).to.equal(false); // 4 directs: not yet 8
    await addMembers(protocol, token, genesis.address, 4);
    expect(await protocol.royaltyClaimable(genesis.address)).to.equal(true);
    await expect(protocol.connect(genesis).claim())
      .to.emit(protocol, "RewardCredited")
      .withArgs(genesis.address, earned, ethers.keccak256(ethers.toUtf8Bytes("STAR_CLUB_ROYALTY")));
    expect(await protocol.heldRoyalty(genesis.address)).to.equal(0n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("exposes the exact pool tables and original ten-level percentages", async function () {
    const { protocol } = await fixture();
    // Single-Leg Pool (Hybrid) table: Level 1 $11 + $5 global pool, Level 3 $35 + $9 re-entry.
    expect(await protocol.singleLegQuote(1)).to.deep.equal([
      10n, 1n, 11_000_000n, 5_000_000n, 1_000_000n, 1_000_000n,
    ]);
    expect(await protocol.singleLegQuote(2)).to.deep.equal([
      15n, 1n, 15_000_000n, 0n, 2_000_000n, 2_000_000n,
    ]);
    expect(await protocol.singleLegQuote(3)).to.deep.equal([
      30n, 1n, 35_000_000n, 9_000_000n, 3_000_000n, 3_000_000n,
    ]);
    expect((await protocol.singleLegQuote(5)).directs).to.equal(3);
    // Working Pool table (programme pp. 16–17): 15 levels, Level 8 now auto-upgrades into Level 9.
    expect(await protocol.workingLevelQuote(1)).to.deep.equal([
      2n, 15_000_000n, 30_000_000n, 15_000_000n, 15_000_000n,
    ]);
    expect(await protocol.workingLevelQuote(8)).to.deep.equal([
      16n, 960_000_000n, 15_360_000_000n, 1_920_000_000n, 13_440_000_000n,
    ]);
    expect(await protocol.workingLevelQuote(15)).to.deep.equal([
      30n, 122_880_000_000n, 3_686_400_000_000n, 0n, 3_686_400_000_000n,
    ]);
    await expect(protocol.workingLevelQuote(16)).to.be.revertedWithCustomError(protocol, "InvalidLevel");
    expect(await protocol.nonWorkingLevelQuote(15)).to.deep.equal([
      30n, 40_960_000_000n, 1_228_800_000_000n, 0n, 1_228_800_000_000n,
    ]);
    expect(await protocol.singleLegQuote(10)).to.deep.equal([
      3_700n, 4n, 15_000_000_000n, 0n, 2_500_000_000n, 2_500_000_000n,
    ]);
    const bps = [];
    for (let level = 1; level <= 9; level++) bps.push(await protocol.tenLevelPercentageBps(level));
    expect(bps).to.deep.equal([1_000n, 400n, 200n, 50n, 50n, 50n, 50n, 50n, 50n]);
  });

  it("uses the Single-Leg direct requirements from the published table", async function () {
    const { protocol } = await fixture();
    const quote1 = await protocol.singleLegQuote(1);
    const quote2 = await protocol.singleLegQuote(2);
    const quote3 = await protocol.singleLegQuote(3);
    expect(quote1.directs).to.equal(1);
    expect(quote2.directs).to.equal(1);
    expect(quote3.directs).to.equal(1);
    expect((await protocol.singleLegQuote(4)).directs).to.equal(2);
  });

  it("reaches Working levels by members at each depth and pays the table income", async function () {
    const { genesis, alice, bob, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    expect(await protocol.workingLevel(genesis.address)).to.equal(0);
    await protocol.connect(bob).register(genesis.address);
    // Level 1 (2 directs): turnover 30, auto-upgrade 15, distributable 15 -> achiever 80% = 12 USDT.
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(12_000_000n);
    // More directs do not reach Level 2: it needs 4 members at depth 2.
    await addMembers(protocol, token, genesis.address, 3);
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    await addMembers(protocol, token, alice.address, 3);
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    await addMembers(protocol, token, bob.address, 1);
    // Level 2 (4 at depth 2): turnover 60, auto-upgrade 30, distributable 30 -> 24 USDT more.
    expect(await protocol.workingLevel(genesis.address)).to.equal(2);
    // 12 + 24 for its own levels, plus 1.5 as alice's U1 when she reached Level 1 (10% of 15).
    expect(await protocol.workingLevel(alice.address)).to.equal(1); // alice has 3 directs
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(37_500_000n);
    await expect(protocol.connect(genesis).settlePoolRewards())
      .to.emit(protocol, "RewardCredited")
      .withArgs(genesis.address, 37_500_000n, ethers.keccak256(ethers.toUtf8Bytes("WORKING_LEVEL_INCOME")));
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("funds Single-Leg from 9 USDT and redirects 5 USDT at level one", async function () {
    const { genesis, protocol, token } = await fixture();
    await addMembers(protocol, token, genesis.address, 10);
    // Level 1 (10 team, 1 direct): 11 USDT to the member and the 5 USDT Non-Working redirect.
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(1);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(11_000_000n);
    expect(await protocol.nonWorkingEntryCredit(genesis.address)).to.equal(5_000_000n);
    expect(await protocol.nonWorkingReserve()).to.equal(5_000_000n);
    await addMembers(protocol, token, genesis.address, 5);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(2);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(26_000_000n);
    expect(await protocol.nonWorkingEntryCredit(genesis.address)).to.equal(5_000_000n);
    expect(await protocol.singleLegReserve()).to.equal(130_000_000n);
    expect(await protocol.poolRewardCap(genesis.address)).to.equal(125_000_000n);
    await protocol.connect(genesis).settlePoolRewards();
    // 26 USDT Single-Leg plus 12 USDT Working Level 1 (15 directs: Level 2 needs depth-2 members).
    expect(await protocol.rankedPoolRewardsCredited(genesis.address)).to.equal(38_000_000n);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(0);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("withdraws rewards using the 80/15/5 split", async function () {
    const { genesis, alice, bob, carol, club, development, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    await protocol.connect(carol).register(genesis.address);
    const gross = await protocol.claimable(genesis.address);
    expect(gross).to.equal(12_000_000n);
    // 15% royalty = 1.8 USDT, 3% (0.36) per club. Only the 1 Star club has members;
    // the four empty clubs forward 1.44 USDT to the vault.
    await expect(protocol.connect(genesis).claim())
      .to.emit(protocol, "Claimed")
      .withArgs(genesis.address, gross, 9_600_000n, 1_800_000n, 600_000n);
    expect(await token.balanceOf(genesis.address)).to.equal(9_600_000n);
    expect(await token.balanceOf(club.address)).to.equal(1_440_000n);
    expect(await token.balanceOf(development.address)).to.equal(600_000n);
    expect(await protocol.clubLiability()).to.equal(360_000n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("shares each club's 3% equally among the members of that club", async function () {
    const { genesis, alice, bob, carol, dave, protocol } = await fixture();
    for (const member of [alice, bob, carol, dave]) await protocol.connect(member).register(genesis.address);
    // genesis has four directs -> 2 Star; alice, bob, carol, dave -> 1 Star.
    expect(await protocol.starRank(genesis.address)).to.equal(2);
    expect(await protocol.clubRank(genesis.address)).to.equal(2);
    expect(await protocol.clubMemberCount(1)).to.equal(4);
    expect(await protocol.clubMemberCount(2)).to.equal(1);

    const gross = await protocol.claimable(genesis.address); // 24 USDT from directs 3 and 4
    await protocol.connect(genesis).claim();
    const clubShare = gross * 300n / 10_000n;
    expect(await protocol.pendingClubReward(alice.address)).to.equal(clubShare / 4n);
    expect(await protocol.pendingClubReward(genesis.address)).to.equal(clubShare);
    expect(await protocol.withdrawable(alice.address)).to.equal(clubShare / 4n);

    await expect(protocol.connect(alice).claim())
      .to.emit(protocol, "RewardCredited")
      .withArgs(alice.address, clubShare / 4n, ethers.keccak256(ethers.toUtf8Bytes("STAR_CLUB_ROYALTY")));
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("settles club royalty and moves the member when their rank rises", async function () {
    const { genesis, alice, bob, carol, dave, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    await protocol.connect(carol).register(genesis.address);
    await protocol.connect(genesis).claim(); // 0.36 USDT shared by the 4 one-star members
    const earned = await protocol.pendingClubReward(genesis.address);
    expect(earned).to.equal(90_000n);
    await protocol.connect(dave).register(genesis.address); // fourth direct -> 2 Star
    expect(await protocol.clubRank(genesis.address)).to.equal(2);
    expect(await protocol.clubMemberCount(1)).to.equal(4); // alice, bob, carol, dave
    expect(await protocol.pendingClubReward(genesis.address)).to.equal(0n);
    expect(await protocol.claimable(genesis.address)).to.equal(12_000_000n + earned);
    expect(await token.balanceOf(await protocol.getAddress())).to.be.greaterThan(0n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("counts the team at each sponsor level and keeps the total in step", async function () {
    const { genesis, alice, bob, carol, dave, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(alice.address);
    await protocol.connect(carol).register(alice.address);
    await protocol.connect(dave).register(bob.address);
    const counts = await protocol.getLevelTeamCounts(genesis.address);
    expect(counts.slice(0, 4)).to.deep.equal([1n, 2n, 1n, 0n]);
    expect(await protocol.teamCount(genesis.address)).to.equal(4);
    expect((await protocol.getLevelTeamCounts(alice.address)).slice(0, 2)).to.deep.equal([2n, 1n]);
    await protocol.syncLevelTeam(1, 100); // already recorded at registration: no double counting
    expect((await protocol.getLevelTeamCounts(genesis.address)).slice(0, 3)).to.deep.equal([1n, 2n, 1n]);
  });

  it("keeps an on-chain income ledger, withdrawal totals and referral lists", async function () {
    const { genesis, alice, bob, carol, protocol } = await fixture();
    for (const member of [alice, bob, carol]) await protocol.connect(member).register(genesis.address);
    const direct = ethers.keccak256(ethers.toUtf8Bytes("DIRECT_INCOME"));
    expect(await protocol.incomeByReason(genesis.address, direct)).to.equal(12_000_000n);
    expect(await protocol.incomeCountByReason(genesis.address, direct)).to.equal(1);
    expect(await protocol.lifetimeEarned(genesis.address)).to.equal(await protocol.claimable(genesis.address));
    const before = await protocol.claimable(genesis.address);
    await protocol.connect(genesis).claim();
    expect(await protocol.totalWithdrawnGross(genesis.address)).to.equal(before);
    expect(await protocol.withdrawCount(genesis.address)).to.equal(1);
    expect(await protocol.lifetimeEarned(genesis.address)).to.equal(before + (await protocol.claimable(genesis.address)));
    expect(await protocol.directReferralCount(genesis.address)).to.equal(3);
    expect(await protocol.getDirectReferrals(genesis.address, 0, 10)).to.deep.equal([alice.address, bob.address, carol.address]);
    expect(await protocol.getDirectReferrals(genesis.address, 1, 1)).to.deep.equal([bob.address]);
    await protocol.syncDirectList(1, 100); // no duplicates
    expect(await protocol.directReferralCount(genesis.address)).to.equal(3);
  });

  it("exposes the rank rules the contract itself enforces", async function () {
    const { protocol, ticket } = await fixture();
    expect(await protocol.rankRule(1)).to.deep.equal([0n, 0n, 0n, ticket * 2n]);
    expect(await protocol.rankRule(3)).to.deep.equal([0n, 2n, 16n, ticket * 10n]);
    expect(await protocol.rankRule(5)).to.deep.equal([0n, 4n, 300n, ethers.MaxUint256]);
    const claimDirects = [];
    for (let rank = 1; rank <= 5; rank++) claimDirects.push(await protocol.clubClaimDirects(rank));
    expect(claimDirects).to.deep.equal([0n, 4n, 8n, 12n, 16n]);
    await expect(protocol.rankRule(6)).to.be.revertedWithCustomError(protocol, "InvalidLevel");
    expect(await protocol.SUPERSTAR_MIN_DIRECTS()).to.equal(5);
    expect(await protocol.DIRECT_SHARE_BPS()).to.equal(8_000);
  });

  it("lets anyone enrol existing members into their clubs after an upgrade", async function () {
    const { genesis, alice, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.syncClubMembers(1, 100); // idempotent: already enrolled members are unchanged
    expect(await protocol.clubMemberCount(1)).to.equal(2);
    expect(await protocol.clubRank(alice.address)).to.equal(1);
  });

  // A chain of 10 members with 15 recruits under the last one: every chain member has a team of 15+
  // and a direct, so all 10 cross Single-Leg Level 2, and each counts for every upline within 10 levels.
  async function addLevelTwoChain(protocol: any, token: any, sponsor: string) {
    let parent = sponsor;
    for (let i = 0; i < 10; i++) parent = (await addMembers(protocol, token, parent, 1))[0].address;
    await addMembers(protocol, token, parent, 15);
  }

  it("needs 30 team members who crossed Single-Leg Level 2 before Level 3", async function () {
    const { genesis, protocol, token } = await fixture();
    await addMembers(protocol, token, genesis.address, 30);
    // 30 team members, but none of them has crossed Level 2 yet.
    expect(await protocol.teamCount(genesis.address)).to.equal(30);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(2);
    expect(await protocol.singleLegTeamFor(genesis.address, 3)).to.equal(0);
  });

  it("fills the Non-Working matrix only with members who reached Single-Leg Level 1", async function () {
    const { genesis, protocol, token } = await fixture();
    await addMembers(protocol, token, genesis.address, 9);
    // 9 team members, none in Single-Leg Level 1: no Non-Working positions.
    expect(await protocol.nonWorkingTeamCount(genesis.address)).to.equal(0);
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(0);

    await addLevelTwoChain(protocol, token, genesis.address);
    // All 10 chain members reached Single-Leg Level 1 and entered: 10 positions -> Level 5.
    expect(await protocol.nonWorkingTeamCount(genesis.address)).to.equal(10);
    expect(await protocol.nonWorkingEntryCredit(genesis.address)).to.equal(5_000_000n);
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(5);
    expect(await protocol.pendingNonWorkingPoolIncome(genesis.address)).to.be.greaterThan(0n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("lets only the owner reset levels left by an old rule", async function () {
    const { genesis, alice, protocol } = await fixture();
    await expect(protocol.connect(alice).resetLegacyLevels([genesis.address], false)).to.be.reverted;
    await protocol.connect(genesis).resetLegacyLevels([genesis.address, alice.address], false); // nothing to clear
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(0);
    // Working reset re-derives the level from members at each depth and re-queues its income.
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(genesis).resetLegacyLevels([genesis.address], true);
    expect(await protocol.workingLevel(genesis.address)).to.equal(0); // one direct: Level 1 needs two
  });

  it("uses 9 USDT for a second Single-Leg entry at level three", async function () {
    const { genesis, protocol, token } = await fixture();
    for (let i = 0; i < 3; i++) await addLevelTwoChain(protocol, token, genesis.address);
    expect(await protocol.singleLegTeamFor(genesis.address, 3)).to.equal(30);
    // The last qualifiers were more than 10 levels below the new registrations' sponsors' reach,
    // so genesis is re-checked explicitly.
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(2);
    const before = await protocol.pendingSingleLegIncome(genesis.address);
    await protocol.syncSingleLeg(genesis.address);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(3);
    // Level 3 pays the member 35 USDT (pending also holds Upline 1/2 shares from the chains).
    expect((await protocol.pendingSingleLegIncome(genesis.address)) - before).to.equal(35_000_000n);
    expect(await protocol.singleLegEntries(genesis.address)).to.equal(2);
    expect(await protocol.singleLegReentries(genesis.address)).to.equal(1);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("pays the accumulated 1 USDT registrations to a weekly recruiter with five directs", async function () {
    const { genesis, protocol, token } = await fixture();
    const week = await protocol.currentWeek();
    await addMembers(protocol, token, genesis.address, 5);
    expect(await protocol.superstarReserve()).to.equal(5_000_000n);
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await expect(protocol.closeWeek(week)).to.emit(protocol, "WeekClosed").withArgs(week, genesis.address, 5_000_000n);
    expect(await protocol.superstarReserve()).to.equal(0);
    await expect(protocol.closeWeek(week)).to.be.revertedWithCustomError(protocol, "WeekAlreadyClosed");
  });

  it("rejects invalid registrations and insufficient allowance", async function () {
    const { genesis, alice, bob, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await expect(protocol.connect(alice).register(genesis.address)).to.be.revertedWithCustomError(protocol, "AlreadyRegistered");
    await expect(protocol.connect(bob).register(bob.address)).to.be.revertedWithCustomError(protocol, "SelfSponsorship");
    await expect(protocol.connect(bob).register(ethers.Wallet.createRandom().address))
      .to.be.revertedWithCustomError(protocol, "SponsorNotRegistered");
    await token.connect(bob).approve(await protocol.getAddress(), 24_000_000n);
    await expect(protocol.connect(bob).register(genesis.address)).to.be.reverted;
    expect(await protocol.isRegistered(bob.address)).to.equal(false);
  });

  it("rejects fee-on-transfer tokens without partial state", async function () {
    const [genesis, alice, working, nonWorking, club, development] = await ethers.getSigners();
    const token = await ethers.deployContract("MockFeeToken");
    const factory = await ethers.getContractFactory("OpenProtocolParticipation");
    const protocol = await upgrades.deployProxy(factory, [
      await token.getAddress(), working.address, nonWorking.address, club.address, development.address, genesis.address,
    ], { initializer: "initialize", kind: "uups" });
    await token.mint(alice.address, 25_000_000n);
    await token.connect(alice).approve(await protocol.getAddress(), 25_000_000n);
    await expect(protocol.connect(alice).register(genesis.address))
      .to.be.revertedWithCustomError(protocol, "IncorrectTokenReceipt");
    expect(await protocol.isRegistered(alice.address)).to.equal(false);
  });

  it("allows only the owner to upgrade while preserving proxy state", async function () {
    const { genesis, alice, protocol } = await fixture();
    const proxyAddress = await protocol.getAddress();
    const v2 = await ethers.getContractFactory("OpenProtocolParticipationV2");
    await expect(upgrades.upgradeProxy(proxyAddress, v2.connect(alice), { kind: "uups" })).to.be.reverted;
    const upgraded = await upgrades.upgradeProxy(proxyAddress, v2.connect(genesis), { kind: "uups" });
    expect(await upgraded.getAddress()).to.equal(proxyAddress);
    expect(await upgraded.version()).to.equal(2);
    expect(await upgraded.memberCount()).to.equal(1);
    expect(await upgraded.owner()).to.equal(genesis.address);
  });
});
