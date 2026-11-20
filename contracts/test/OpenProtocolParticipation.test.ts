import { expect } from "chai";
import { ethers } from "hardhat";

describe("OpenProtocolParticipation", function () {
  async function fixture() {
    const [genesis, alice, bob, carol, dave, working, nonWorking, club, development] = await ethers.getSigners();
    const token = await ethers.deployContract("MockUSDT");
    const protocol = await ethers.deployContract("OpenProtocolParticipation", [
      await token.getAddress(), working.address, nonWorking.address, club.address,
      development.address, genesis.address,
    ]);
    const ticket = 25_000_000n;
    for (const member of [alice, bob, carol, dave]) {
      await token.mint(member.address, ticket);
      await token.connect(member).approve(await protocol.getAddress(), ticket);
    }
    return { genesis, alice, bob, carol, dave, working, nonWorking, club, development, token, protocol, ticket };
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
    expect((await protocol.claimable(genesis.address)) - before).to.equal(14_400_000n);
  });

  it("tracks automatic levels and star rank", async function () {
    const { genesis, alice, bob, carol, dave, protocol } = await fixture();
    for (const member of [alice, bob, carol, dave]) await protocol.connect(member).register(genesis.address);
    expect(await protocol.teamCount(genesis.address)).to.equal(4);
    expect(await protocol.workingLevel(genesis.address)).to.equal(2);
    expect(await protocol.nonWorkingLevel(genesis.address)).to.equal(2);
    expect(await protocol.starRank(genesis.address)).to.equal(1);
  });

  it("exposes the exact pool tables and original ten-level percentages", async function () {
    const { protocol } = await fixture();
    expect(await protocol.singleLegQuote(3)).to.deep.equal([
      30n, 2n, 35_000_000n, 9_000_000n, 3_000_000n, 3_000_000n,
    ]);
    expect(await protocol.workingLevelQuote(8)).to.deep.equal([
      16n, 960_000_000n, 15_360_000_000n, 0n, 15_360_000_000n,
    ]);
    expect(await protocol.nonWorkingLevelQuote(15)).to.deep.equal([
      30n, 40_960_000_000n, 1_228_800_000_000n, 0n, 1_228_800_000_000n,
    ]);
    expect(await protocol.singleLegQuote(10)).to.deep.equal([
      3_700n, 4n, 15_000_000_000n, 0n, 2_500_000_000n, 2_500_000_000n,
    ]);
    const bps = [];
    for (let level = 1; level <= 10; level++) bps.push(await protocol.tenLevelPercentageBps(level));
    expect(bps).to.deep.equal([1_000n, 400n, 200n, 50n, 50n, 50n, 50n, 50n, 50n, 50n]);
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

  it("queues level income after consuming the next auto-upgrade", async function () {
    const { genesis, alice, bob, protocol } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    await protocol.connect(bob).register(genesis.address);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(12_000_000n);
    expect(await protocol.pendingNonWorkingPoolIncome(genesis.address)).to.equal(4_000_000n);
    expect(await protocol.workingAutoUpgradeConsumed()).to.equal(15_000_000n);
    expect(await protocol.nonWorkingAutoUpgradeConsumed()).to.equal(5_000_000n);
    expect(await protocol.poolRewardCap(genesis.address)).to.equal(50_000_000n);
    await protocol.connect(genesis).settlePoolRewards();
    expect(await protocol.rankedPoolRewardsCredited(genesis.address)).to.equal(12_000_000n);
    expect(await protocol.pendingWorkingPoolIncome(genesis.address)).to.equal(0);
    expect(await protocol.pendingNonWorkingPoolIncome(genesis.address)).to.equal(4_000_000n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("withdraws rewards using the 80/17/3 split", async function () {
    const { genesis, alice, club, development, protocol, token } = await fixture();
    await protocol.connect(alice).register(genesis.address);
    const gross = await protocol.claimable(genesis.address);
    expect(gross).to.equal(8_100_000n);
    await expect(protocol.connect(genesis).claim())
      .to.emit(protocol, "Claimed")
      .withArgs(genesis.address, gross, 6_480_000n, 1_377_000n, 243_000n);
    expect(await token.balanceOf(genesis.address)).to.equal(6_480_000n);
    expect(await token.balanceOf(club.address)).to.equal(1_377_000n);
    expect(await token.balanceOf(development.address)).to.equal(243_000n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("funds automatic working re-entry from available reserve", async function () {
    const signers = await ethers.getSigners();
    const genesis = signers[0];
    const token = await ethers.deployContract("MockUSDT");
    const protocol = await ethers.deployContract("OpenProtocolParticipation", [
      await token.getAddress(), signers[17].address, signers[18].address,
      signers[19].address, signers[19].address, genesis.address,
    ]);
    for (const member of signers.slice(1, 17)) {
      await token.mint(member.address, 25_000_000n);
      await token.connect(member).approve(await protocol.getAddress(), 25_000_000n);
      await protocol.connect(member).register(genesis.address);
    }
    expect(await protocol.workingReentries(genesis.address)).to.equal(1);
    expect(await protocol.singleLegLevel(genesis.address)).to.equal(2);
    expect(await protocol.pendingSingleLegIncome(genesis.address)).to.equal(30_000_000n);
    expect(await protocol.poolRewardCap(genesis.address)).to.equal(250_000_000n);
    expect(await protocol.solvencyInvariantHolds()).to.equal(true);
  });

  it("closes a completed week once", async function () {
    const { genesis, alice, protocol } = await fixture();
    const week = await protocol.currentWeek();
    await protocol.connect(alice).register(genesis.address);
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await expect(protocol.closeWeek(week)).to.emit(protocol, "WeekClosed");
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
    const protocol = await ethers.deployContract("OpenProtocolParticipation", [
      await token.getAddress(), working.address, nonWorking.address, club.address,
      development.address, genesis.address,
    ]);
    await token.mint(alice.address, 25_000_000n);
    await token.connect(alice).approve(await protocol.getAddress(), 25_000_000n);
    await expect(protocol.connect(alice).register(genesis.address))
      .to.be.revertedWithCustomError(protocol, "IncorrectTokenReceipt");
    expect(await protocol.isRegistered(alice.address)).to.equal(false);
  });
});
