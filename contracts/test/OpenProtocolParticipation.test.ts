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
    const ticket = 30_000_000n;
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
      await token.mint(member.address, 30_000_000n);
      await token.connect(member).approve(await protocol.getAddress(), 30_000_000n);
      await protocol.connect(member).register(sponsor);
      members.push(member);
    }
    return members;
  }

  it("creates genesis and atomically records a 30 USDT registration", async function () {
    const { genesis, alice, protocol, token, ticket } = await fixture();
    expect(await protocol.ticketPrice()).to.equal(30_000_000n);
    // 15 Working, 5 Non-Working + 9 Single-Leg (reported together), 1 Superstar.
    await expect(protocol.connect(alice).register(genesis.address))
      .to.emit(protocol, "ParticipationAllocated")
      .withArgs(alice.address, 15_000_000n, 14_000_000n, 1_000_000n);
    expect(await protocol.nonWorkingReserve()).to.equal(5_000_000n);
    expect(await protocol.singleLegReserve()).to.equal(9_000_000n);
    expect(await protocol.superstarReserve()).to.equal(1_000_000n);
    // The one-time live-proxy migration is owner-only and cannot run twice.
    await expect(protocol.connect(alice).initializeTicket30()).to.be.reverted;
    await protocol.connect(genesis).initializeTicket30();
    await expect(protocol.connect(genesis).initializeTicket30()).to.be.reverted;
    expect(await token.balanceOf(await protocol.getAddress())).to.equal(ticket);
    expect((await protocol.getParticipant(alice.address)).id).to.equal(2);
    expect(await protocol.totalParticipated()).to.equal(ticket);
    expect(await protocol.accountingInvariantHolds()).to.equal(true);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("pays 12 USDT for the 1st direct, uses the 2nd for the upgrade and pays again from the 3rd", async function () {
    const { genesis, alice, bob, carol, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    // 1st direct: 12 USDT to the sponsor (Working Level 1 income) and 3 USDT to the uplines.
    expect(await protocol.claimable(genesis.address)).to.equal(12_000_000n);
    await protocol.connect(bob).register(genesis.address);
    // 2nd direct: the whole 15 USDT is the sponsor's auto-upgrade into Level 2.
    expect(await protocol.claimable(genesis.address)).to.equal(12_000_000n);
    expect(await protocol.autoUpgradeCredit(genesis.address)).to.equal(15_000_000n);
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(0n); // Level 1 is not paid twice
    await protocol.connect(carol).register(genesis.address);
    expect(await protocol.claimable(genesis.address)).to.equal(24_000_000n);
    // Reserve: the 2nd direct's 15 + 3 from each paid direct (genesis has no uplines to pay).
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
    // Non-Working Level 1 fills with the first 2 entries; genesis has no upline to host its Level 2 entry.
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(1);
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
    expect(await protocol.poolRewardCap(genesis.address)).to.equal(30_000_000n * 10n);
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
    expect(await protocol.claimable(genesis.address)).to.equal(12_000_000n + oneStarShare); // alice's 12 + 1 Star share
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
      10n, 1n, 6_000_000n, 0n, 1_000_000n, 1_000_000n,
    ]);
    expect(await protocol.singleLegQuote(2)).to.deep.equal([
      25n, 2n, 15_000_000n, 0n, 2_000_000n, 2_000_000n,
    ]);
    expect(await protocol.singleLegQuote(3)).to.deep.equal([
      30n, 3n, 35_000_000n, 9_000_000n, 3_000_000n, 3_000_000n,
    ]);
    // Directs add up level by level: 1, 2, 3, 5, 8, 11, 14, 17, 21, 25.
    const totals = [];
    for (let level = 1; level <= 10; level++) totals.push((await protocol.singleLegQuote(level)).directs);
    expect(totals).to.deep.equal([1n, 2n, 3n, 5n, 8n, 11n, 14n, 17n, 21n, 25n]);
    expect(await protocol.singleLegQuote(10)).to.deep.equal([
      3_700n, 25n, 15_000_000_000n, 0n, 2_500_000_000n, 2_500_000_000n,
    ]);
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

  it("uses four Working Level 2 entries: two for upgrade and two for distribution", async function () {
    const { genesis, alice, bob, carol, dave, protocol, token } = await fixture();
    for (const member of [alice, bob, carol, dave]) await protocol.connect(member).register(genesis.address);
    // Level 1 completed by the 2nd direct (its 15 USDT is the upgrade); genesis has no upline to host Level 2.
    expect(await protocol.workingLevel(genesis.address)).to.equal(1);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(0n);
    // Each direct completing Level 1 enters genesis's Level 2 matrix. Position 3 immediately queues
    // its 12 USDT member share; position 4 queues another 12 USDT and completes the level.
    for (const [index, direct] of [alice, bob, carol, dave].entries()) {
      await addMembers(protocol, token, direct.address, 2);
      expect(await protocol.matrixFilled(genesis.address, 2)).to.equal(index + 1);
      expect(await protocol.workingLevel(genesis.address)).to.equal(index < 3 ? 1 : 2);
      expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(
        index < 2 ? 0n : index === 2 ? 12_000_000n : 24_000_000n,
      );
    }
    // Level 2: 4 × 15 = 60 turnover. Positions 1–2 fund the 30 USDT Level 3 upgrade;
    // positions 3–4 provide the 30 USDT distribution (80% = 24 USDT to genesis).
    expect(await protocol.workingLevel(genesis.address)).to.equal(2);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(24_000_000n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("pays each Working Level 3 distribution position immediately", async function () {
    const { genesis, protocol, token } = await fixture();
    const directs = await addMembers(protocol, token, genesis.address, 4);
    const children = new Map<string, any[]>();

    // Four directs complete Level 1, filling and completing genesis's Level 2.
    for (const direct of directs) children.set(direct.address, await addMembers(protocol, token, direct.address, 2));
    expect(await protocol.workingLevel(genesis.address)).to.equal(2);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(24_000_000n);

    // Three directs complete Level 2. Their first two Level-3 entries fund genesis's upgrade;
    // the third immediately pays genesis 24 USDT (80% of the 30 USDT Level-3 ID).
    for (const [index, direct] of directs.slice(0, 3).entries()) {
      const level2Entries = [...children.get(direct.address)!, ...await addMembers(protocol, token, direct.address, 2)];
      for (const entry of level2Entries) await addMembers(protocol, token, entry.address, 2);
      expect(await protocol.matrixFilled(genesis.address, 3)).to.equal(index + 1);
      // Each direct's Level-2 completion also gives genesis its 3 USDT U1 total.
      expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(
        index < 2 ? 27_000_000n + BigInt(index) * 3_000_000n : 57_000_000n,
      );
    }
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("funds Single-Leg from 9 USDT and Non-Working from 5 USDT of every ticket", async function () {
    const { genesis, protocol, token } = await fixture();
    await addMembers(protocol, token, genesis.address, 10);
    // Level 1 (10 after you, 1 direct): 6 USDT. Single-Leg and Non-Working are independent.
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(1);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(6_000_000n);
    expect(await protocol.nonWorkingReserve()).to.equal(50_000_000n); // 10 tickets × 5
    // Level 2 waits for 25 positions after genesis and 2 total directs.
    await addMembers(protocol, token, genesis.address, 14);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(1);
    await addMembers(protocol, token, genesis.address, 1); // 25th position after genesis
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(2);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(21_000_000n); // 6 + 15
    expect(await protocol.singleLegReserve()).to.equal(225_000_000n); // 25 × 9
    await protocol.connect(genesis).claim();
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(0);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("withdraws rewards using the 80/15/5 split", async function () {
    const { genesis, alice, bob, carol, club, development, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    await protocol.connect(carol).register(genesis.address);
    const credited = await protocol.claimable(genesis.address);
    expect(credited).to.equal(24_000_000n); // bob and carol; alice was reserved
    // Claim automatically includes the backed 4 USDT Non-Working reward.
    const gross = credited + await protocol.pendingNonWorkingPoolIncome(genesis.address);
    expect(gross).to.equal(28_000_000n);
    await expect(protocol.connect(genesis).claim())
      .to.emit(protocol, "Claimed")
      .withArgs(genesis.address, gross, 22_400_000n, 4_200_000n, 1_400_000n);
    expect(await token.balanceOf(genesis.address)).to.equal(22_400_000n);
    expect(await token.balanceOf(club.address)).to.equal(3_360_000n);
    expect(await token.balanceOf(development.address)).to.equal(1_400_000n);
    expect(await protocol.clubLiability()).to.equal(840_000n);
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

    const gross = await protocol.claimable(genesis.address)
      + await protocol.pendingSingleLegIncome(genesis.address)
      + await protocol.pendingWorkingPoolIncome(genesis.address)
      + await protocol.pendingNonWorkingPoolIncome(genesis.address);
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
    const firstGross = await protocol.claimable(genesis.address)
      + await protocol.pendingSingleLegIncome(genesis.address)
      + await protocol.pendingWorkingPoolIncome(genesis.address)
      + await protocol.pendingNonWorkingPoolIncome(genesis.address);
    await protocol.connect(genesis).claim();
    const earned = await protocol.pendingClubReward(genesis.address);
    expect(earned).to.equal(firstGross * 300n / 10_000n / 4n);
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
    const before = await protocol.claimable(genesis.address)
      + await protocol.pendingSingleLegIncome(genesis.address)
      + await protocol.pendingWorkingPoolIncome(genesis.address)
      + await protocol.pendingNonWorkingPoolIncome(genesis.address);
    await protocol.connect(genesis).claim();
    expect(await protocol.totalWithdrawnGross(genesis.address)).to.equal(before);
    expect(await protocol.withdrawCount(genesis.address)).to.equal(1);
    expect(await protocol.lifetimeEarned(genesis.address)).to.equal(before + (await protocol.claimable(genesis.address)));
    expect(await protocol.getDirectReferrals(genesis.address, 0, 10)).to.deep.equal([alice.address, bob.address, carol.address]);
    expect(await protocol.getDirectReferrals(genesis.address, 1, 1)).to.deep.equal([bob.address]);
  });

  it("exposes the rank caps and constants the contract enforces", async function () {
    const { protocol, ticket } = await fixture();
    expect(await protocol.poolRewardCap(await protocol.memberById(1))).to.equal(ticket * 2n);
    expect(await protocol.SUPERSTAR_MIN_DIRECTS()).to.equal(5);
    expect(await protocol.DIRECT_SHARE_BPS()).to.equal(8_000);
  });

  it("counts everyone who joins after you in the global Single-Leg line", async function () {
    const { genesis, alice, bob, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address); // position 2
    await protocol.connect(bob).register(alice.address); // alice's only direct
    // 10 more join under genesis, outside alice's team: they still count for alice's Level 1.
    await addMembers(protocol, token, genesis.address, 10);
    expect(await protocol.teamCount(alice.address)).to.equal(1);
    expect(await protocol.singleLegLevel(alice.address)).to.equal(1);
    const info = await protocol.singleLegInfo(alice.address);
    expect(info.primary).to.equal(2);
    expect(info.line).to.equal(13);
    expect(await protocol.lineOwnerAt(2)).to.equal(alice.address);
  });

  it("needs members who reached the level below and re-enters at Level 3", async function () {
    const { genesis, protocol, token } = await fixture();
    // A binary tree: early members have 2 directs and plenty after them, so they climb.
    await addBinaryTree(protocol, token, genesis.address, 100);
    await addMembers(protocol, token, genesis.address, 1); // genesis needs 3 directs for Level 3
    // Level 3 counts people after you who reached Level 2.
    expect(await protocol.singleLegReached(2)).to.be.greaterThanOrEqual(30n);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(3);
    expect(await protocol.singleLegEntries(genesis.address)).to.equal(2);
    expect(await protocol.singleLegReentries(genesis.address)).to.equal(1);
    const reentry = await protocol.reentryPosition(genesis.address);
    expect(reentry).to.be.greaterThan(0n);
    const before = await protocol.pendingSingleLegIncome(genesis.address);
    await addMembers(protocol, token, genesis.address, 10);
    // 10 after the re-entry position: it reaches Level 1 and pays $6 again.
    expect(await protocol.reentryLevel(genesis.address)).to.equal(1);
    expect((await protocol.pendingSingleLegIncome(genesis.address)) - before).to.be.greaterThanOrEqual(6_000_000n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("fills Non-Working first come, first served across the whole platform", async function () {
    const { genesis, alice, bob, protocol, token } = await fixture();
    // Genesis waits first in the Level 1 queue; each new member fills the front member, whoever referred them.
    await protocol.connect(alice).register(genesis.address);
    expect(await protocol.matrixFilled(genesis.address, 17)).to.equal(1); // Non-Working Level 1 key = 1 + 16
    const [a1] = await addMembers(protocol, token, alice.address, 1);
    // a1 was referred by alice, but genesis is first in line: genesis completes Level 1 (80% of 5 = 4 USDT).
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(1);
    expect(await protocol.pendingNonWorkingPoolIncome(genesis.address)).to.equal(4_000_000n);
    expect(await protocol.matrixFilled(alice.address, 17)).to.equal(0);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(0); // Single-Leg is unrelated
    // bob (referred by genesis) now fills alice, who is next in line.
    await protocol.connect(bob).register(genesis.address);
    expect(await protocol.matrixFilled(alice.address, 17)).to.equal(1);
    await addMembers(protocol, token, a1.address, 1);
    // alice completes Level 1; her 5 USDT upgrade fills genesis, first in the Level 2 queue.
    expect(await protocol.nonWorkingLevel(alice.address)).to.equal(1);
    expect(await protocol.matrixFilled(genesis.address, 18)).to.equal(1);
    expect(await protocol.nonWorkingReserve()).to.equal(20_000_000n); // 4 tickets × 5, nothing paid out yet
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
    // The one-time queue migration is owner-only.
    await expect(protocol.connect(alice).seedNonWorkingQueue([alice.address], 3)).to.be.reverted;
  });

  it("keeps every queued Working and Non-Working payout backed by its reserve", async function () {
    const { genesis, protocol, token } = await fixture();
    const members: string[] = [genesis.address];
    let seed = 7;
    for (let i = 0; i < 60; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const sponsor = members[seed % Math.min(members.length, 12)]; // dense early tree, like real growth
      const [member] = await addMembers(protocol, token, sponsor, 1);
      members.push(member.address);
    }
    let working = 0n;
    let nonWorking = 0n;
    for (const member of members) {
      working += await protocol.pendingWorkingPoolIncome(member);
      nonWorking += await protocol.pendingNonWorkingPoolIncome(member);
    }
    // Self-funding: everything queued is covered by entries already paid into each pool.
    // Random growth completes many Non-Working levels; Working Level 2 needs 4 directs who each completed
    // Level 1, which the structured test above covers.
    expect(nonWorking).to.be.greaterThan(0n);
    expect(await protocol.workingReserve()).to.be.greaterThanOrEqual(working);
    expect(await protocol.nonWorkingReserve()).to.be.greaterThanOrEqual(nonWorking);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  /** Registers `count` members as a breadth-first binary tree under `root` (each member gets 2 directs). */
  async function addBinaryTree(protocol: any, token: any, root: string, count: number) {
    const members = [root];
    for (let i = 0; i < count; i++) members.push((await addMembers(protocol, token, members[Math.floor(i / 2)], 1))[0].address);
    return members;
  }

  it("pays the accumulated 1 USDT registrations to a weekly recruiter with five directs", async function () {
    const { genesis, protocol, token } = await fixture();
    const week = BigInt(Math.floor((await ethers.provider.getBlock("latest"))!.timestamp / (7 * 24 * 60 * 60)));
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
    expect((await protocol.getParticipant(bob.address)).id).to.equal(0);
  });

  it("rejects fee-on-transfer tokens without partial state", async function () {
    const [genesis, alice, working, nonWorking, club, development] = await ethers.getSigners();
    const token = await ethers.deployContract("MockFeeToken");
    const factory = await ethers.getContractFactory("OpenProtocolParticipation");
    const protocol = await upgrades.deployProxy(factory, [
      await token.getAddress(), working.address, nonWorking.address, club.address, development.address, genesis.address,
    ], { initializer: "initialize", kind: "uups" });
    await token.mint(alice.address, 30_000_000n);
    await token.connect(alice).approve(await protocol.getAddress(), 30_000_000n);
    await expect(protocol.connect(alice).register(genesis.address))
      .to.be.revertedWithCustomError(protocol, "IncorrectTokenReceipt");
    expect((await protocol.getParticipant(alice.address)).id).to.equal(0);
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
