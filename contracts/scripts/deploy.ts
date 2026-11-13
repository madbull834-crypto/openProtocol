import { ethers } from "hardhat";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const token = required("USDT_ADDRESS");
  const working = required("WORKING_POOL_ADDRESS");
  const nonWorking = required("NON_WORKING_POOL_ADDRESS");
  const club = required("FIVE_STAR_CLUB_ADDRESS");
  const development = required("DEVELOPMENT_FUND_ADDRESS");
  const genesis = process.env.GENESIS_PARTICIPANT ?? deployer.address;

  const factory = await ethers.getContractFactory("OpenProtocolParticipation");
  const protocol = await factory.deploy(token, working, nonWorking, club, development, genesis);
  await protocol.waitForDeployment();

  console.log(JSON.stringify({
    network: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    protocol: await protocol.getAddress(),
    token,
    working,
    nonWorking,
    club,
    development,
    genesis,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
