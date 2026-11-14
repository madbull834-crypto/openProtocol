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
  const protocolAddress = await protocol.getAddress();

  console.log(JSON.stringify({
    network: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    protocol: protocolAddress,
    token,
    working,
    nonWorking,
    club,
    development,
    genesis,
  }, null, 2));
  console.log(`\nFrontend configuration:\nVITE_CHAIN_ID=97\nVITE_PROTOCOL_ADDRESS=${protocolAddress}\nVITE_RPC_URL=${process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545"}\nVITE_EXPLORER_URL=https://testnet.bscscan.com`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
