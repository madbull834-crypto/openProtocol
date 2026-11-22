import { ethers, upgrades } from "hardhat";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const [upgradeAdmin] = await ethers.getSigners();
  const proxyAddress = required("PROTOCOL_PROXY_ADDRESS");
  const previousImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  const factory = await ethers.getContractFactory("OpenProtocolParticipation", upgradeAdmin);
  const protocol = await upgrades.upgradeProxy(proxyAddress, factory, { kind: "uups" });
  await protocol.waitForDeployment();
  // Enrol members who registered before the 1–5 Star club royalty existed. Idempotent, so safe to re-run.
  const memberCount = await protocol.memberCount();
  const batch = 200n;
  for (let from = 1n; from <= memberCount; from += batch) {
    const to = from + batch - 1n;
    await (await protocol.syncClubMembers(from, to)).wait();
    await (await protocol.syncLevelTeam(from, to)).wait();
    await (await protocol.syncDirectList(from, to)).wait();
    console.log(`Synced clubs, level team counts and referral lists for ids ${from}-${to < memberCount ? to : memberCount}`);
  }
  // Read after the sync transactions so public RPCs have caught up with the upgrade block.
  const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log(JSON.stringify({
    network: (await ethers.provider.getNetwork()).chainId.toString(),
    upgradeAdmin: upgradeAdmin.address,
    proxy: proxyAddress,
    previousImplementation,
    implementation,
    clubMembersSynced: memberCount.toString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
