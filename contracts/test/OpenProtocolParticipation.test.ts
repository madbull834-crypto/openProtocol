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
    expect(await protocol.workingLevel(genesis.address)).to.equal(2);
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(2);
    expect(await protocol.starRank(genesis.address)).to.equal(2);
    expect(await protocol.starRank(alice.address)).to.equal(1);
  });

  it("exposes the exact pool tables and original ten-level percentages", async function () {
    const { protocol } = await fixture();
    expect(await protocol.singleLegQuote(2)).to.deep.equal([
      15n, 1n, 15_000_000n, 5_000_000n, 2_000_000n, 2_000_000n,
    ]);
    expect(await protocol.singleLegQuote(3)).to.deep.equal([
      30n, 2n, 26_000_000n, 9_000_000n, 3_000_000n, 3_000_000n,
    ]);
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

  it("requires two directs and prior sequential completion for single-leg level three", async function () {
    const { protocol } = await fixture();
    const quote1 = await protocol.singleLegQuote(1);
    const quote2 = await protocol.singleLegQuote(2);
    const quote3 = await protocol.singleLegQuote(3);
    expect(quote1.directs).to.equal(1);
    expect(quote2.directs).to.equal(1);
    expect(quote3.directs).to.equal(2);
  });

  it("funds Single-Leg from 9 USDT and redirects 5 USDT at level two", async function () {
    const { genesis, protocol, token } = await fixture();
    await addMembers(protocol, token, genesis.address, 15);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(2);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(30_000_000n);
    expect(await protocol.nonWorkingEntryCredit(genesis.address)).to.equal(5_000_000n);
    expect(await protocol.singleLegReserve()).to.equal(130_000_000n);
    expect(await protocol.poolRewardCap(genesis.address)).to.equal(125_000_000n);
    await protocol.connect(genesis).settlePoolRewards();
    expect(await protocol.rankedPoolRewardsCredited(genesis.address)).to.equal(30_000_000n);
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

  it("lets anyone enrol existing members into their clubs after an upgrade", async function () {
    const { genesis, alice, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.syncClubMembers(1, 100); // idempotent: already enrolled members are unchanged
    expect(await protocol.clubMemberCount(1)).to.equal(2);
    expect(await protocol.clubRank(alice.address)).to.equal(1);
  });

  it("uses 9 USDT for a second Single-Leg entry at level three", async function () {
    const { genesis, protocol, token } = await fixture();
    await addMembers(protocol, token, genesis.address, 30);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(3);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(56_000_000n);
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
