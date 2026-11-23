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

  it("reserves the first direct for the upgrade and pays 12 USDT from the second", async function () {
    const { genesis, alice, bob, carol, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    // "Your first direct referral helps you upgrade": its 12 USDT is reserved.
    expect(await protocol.autoUpgradeCredit(genesis.address)).to.equal(12_000_000n);
    expect(await protocol.claimable(genesis.address)).to.equal(0n);
    await protocol.connect(bob).register(genesis.address);
    expect(await protocol.claimable(genesis.address)).to.equal(12_000_000n);
    await protocol.connect(carol).register(genesis.address);
    expect(await protocol.claimable(genesis.address)).to.equal(24_000_000n);
    expect(await protocol.autoUpgradeCredit(genesis.address)).to.equal(12_000_000n);
    // Reserve: the first direct's 12 + 3 per registration (genesis has no uplines to pay).
    expect(await protocol.workingReserve()).to.equal(21_000_000n);
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
    expect(await protocol.claimable(alice.address)).to.equal(24_000_000n); // dave and the third, not carol
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
      25n, 2n, 15_000_000n, 0n, 2_000_000n, 2_000_000n,
    ]);
    expect(await protocol.singleLegQuote(3)).to.deep.equal([
      55n, 3n, 35_000_000n, 9_000_000n, 3_000_000n, 3_000_000n,
    ]);
    // Directs add up level by level: 1, 2, 3, 5, 8, 11, 14, 17, 21, 25.
    const totals = [];
    for (let level = 1; level <= 10; level++) totals.push((await protocol.singleLegQuote(level)).directs);
    expect(totals).to.deep.equal([1n, 2n, 3n, 5n, 8n, 11n, 14n, 17n, 21n, 25n]);
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
      9_665n, 25n, 15_000_000_000n, 0n, 2_500_000_000n, 2_500_000_000n,
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
    expect(quote2.directs).to.equal(2);
    expect(quote3.directs).to.equal(3);
    expect((await protocol.singleLegQuote(4)).directs).to.equal(5);
  });

  it("fills Working levels with team members who upgraded into them", async function () {
    const { genesis, alice, bob, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    // Level 1 completes with 2 directs: turnover 30, auto-upgrade 15 -> 80% of 15 = 12 USDT.
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(12_000_000n);

    // Depth alone no longer counts: 4 members two levels down who have not upgraded.
    const [a1, a2] = await addMembers(protocol, token, alice.address, 2); // alice completes L1 -> enters L2
    expect(await protocol.workingEnteredCount(genesis.address, 2)).to.equal(1);
    const [b1, b2] = await addMembers(protocol, token, bob.address, 2); // bob enters L2
    expect(await protocol.workingEnteredCount(genesis.address, 2)).to.equal(2);
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);

    // a1 and a2 complete Level 1 too (2 directs each): 4 team members have entered Level 2.
    await addMembers(protocol, token, a1.address, 2);
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    await addMembers(protocol, token, a2.address, 2);
    expect(await protocol.workingEnteredCount(genesis.address, 2)).to.equal(4);
    expect(await protocol.workingLevel(genesis.address)).to.equal(2);
    void b1; void b2;
    // Level 2: turnover 60, auto-upgrade 30 -> 80% of 30 = 24 USDT, plus U1 10% of alice's and bob's
    // Level 1 (1.5 each) and U2 1.25% of a1's and a2's Level 1 (0.1875 each).
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(12_000_000n + 24_000_000n + 2n * 1_500_000n + 2n * 187_500n);
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
    await addMembers(protocol, token, genesis.address, 14);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(1); // 24 after: Level 2 needs 25
    await addMembers(protocol, token, genesis.address, 1);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(2);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(26_000_000n);
    expect(await protocol.nonWorkingEntryCredit(genesis.address)).to.equal(5_000_000n);
    expect(await protocol.singleLegReserve()).to.equal(220_000_000n); // 25 × 9 − 5 redirect
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
    expect(gross).to.equal(24_000_000n); // bob and carol; alice was reserved
    // 15% royalty = 3.6 USDT, 3% (0.72) per club. Only the 1 Star club has members;
    // the four empty clubs forward 2.88 USDT to the vault.
    await expect(protocol.connect(genesis).claim())
      .to.emit(protocol, "Claimed")
      .withArgs(genesis.address, gross, 19_200_000n, 3_600_000n, 1_200_000n);
    expect(await token.balanceOf(genesis.address)).to.equal(19_200_000n);
    expect(await token.balanceOf(club.address)).to.equal(2_880_000n);
    expect(await token.balanceOf(development.address)).to.equal(1_200_000n);
    expect(await protocol.clubLiability()).to.equal(720_000n);
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
    await protocol.connect(genesis).claim(); // 0.72 USDT shared by the 4 one-star members
    const earned = await protocol.pendingClubReward(genesis.address);
    expect(earned).to.equal(180_000n);
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
  });

  it("keeps an on-chain income ledger, withdrawal totals and referral lists", async function () {
    const { genesis, alice, bob, carol, protocol } = await fixture();
    for (const member of [alice, bob, carol]) await protocol.connect(member).register(genesis.address);
    const direct = ethers.keccak256(ethers.toUtf8Bytes("DIRECT_INCOME"));
    expect(await protocol.incomeByReason(genesis.address, direct)).to.equal(24_000_000n);
    expect(await protocol.incomeCountByReason(genesis.address, direct)).to.equal(2);
    expect(await protocol.lifetimeEarned(genesis.address)).to.equal(await protocol.claimable(genesis.address));
    const before = await protocol.claimable(genesis.address);
    await protocol.connect(genesis).claim();
    expect(await protocol.totalWithdrawnGross(genesis.address)).to.equal(before);
    expect(await protocol.withdrawCount(genesis.address)).to.equal(1);
    expect(await protocol.lifetimeEarned(genesis.address)).to.equal(before + (await protocol.claimable(genesis.address)));
    expect(await protocol.directReferralCount(genesis.address)).to.equal(3);
    expect(await protocol.getDirectReferrals(genesis.address, 0, 10)).to.deep.equal([alice.address, bob.address, carol.address]);
    expect(await protocol.getDirectReferrals(genesis.address, 1, 1)).to.deep.equal([bob.address]);
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

  it("counts everyone who joins after you in the global Single-Leg line", async function () {
    const { genesis, alice, bob, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address); // position 2
    await protocol.connect(bob).register(alice.address); // alice's only direct
    // 10 more join under genesis, outside alice's team: they still count for alice.
    await addMembers(protocol, token, genesis.address, 10);
    expect(await protocol.teamCount(alice.address)).to.equal(1);
    expect(await protocol.singleLegLevel(alice.address)).to.equal(1);
    const info = await protocol.singleLegInfo(alice.address);
    expect(info.primary).to.equal(2);
    expect(info.line).to.equal(13);
    expect(await protocol.lineOwnerAt(2)).to.equal(alice.address);
    // 25 after her but still 1 direct: Level 2 needs 25 after and 2 directs in total.
    await addMembers(protocol, token, genesis.address, 14);
    expect(await protocol.singleLegLevel(alice.address)).to.equal(1);
    await addMembers(protocol, token, alice.address, 1);
    expect(await protocol.singleLegLevel(alice.address)).to.equal(2);
  });

  it("re-enters at Level 3 with a new position that climbs and pays again", async function () {
    const { genesis, protocol, token } = await fixture();
    await addMembers(protocol, token, genesis.address, 55);
    // 55 joined after genesis (10 + 15 + 30): Level 3 ($35) and a re-entry at the end of the line.
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(3);
    expect(await protocol.singleLegEntries(genesis.address)).to.equal(2);
    expect(await protocol.singleLegReentries(genesis.address)).to.equal(1);
    expect(await protocol.reentryPosition(genesis.address)).to.equal(57);
    const before = await protocol.pendingSingleLegIncome(genesis.address);
    await addMembers(protocol, token, genesis.address, 10);
    // 10 after the re-entry position: it reaches Level 1 and pays $11 again.
    expect(await protocol.reentryLevel(genesis.address)).to.equal(1);
    expect((await protocol.pendingSingleLegIncome(genesis.address)) - before).to.equal(11_000_000n);
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
