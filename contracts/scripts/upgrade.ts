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
  // Optional one-time initializer to run inside the upgrade transaction, e.g. UPGRADE_CALL=initializeTicket30.
  const call = process.env.UPGRADE_CALL?.trim();
  const protocol = await upgrades.upgradeProxy(proxyAddress, factory, { kind: "uups", ...(call ? { call: { fn: call } } : {}) });
  await protocol.waitForDeployment();
  // Public RPCs can lag the upgrade block; wait before reading the new implementation slot.
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log(JSON.stringify({
    network: (await ethers.provider.getNetwork()).chainId.toString(),
    upgradeAdmin: upgradeAdmin.address,
    proxy: proxyAddress,
    previousImplementation,
    implementation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
