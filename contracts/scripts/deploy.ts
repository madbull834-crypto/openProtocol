import { ethers, upgrades } from "hardhat";

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
  const protocol = await upgrades.deployProxy(
    factory,
    [token, working, nonWorking, club, development, genesis],
    { initializer: "initialize", kind: "uups" },
  );
  await protocol.waitForDeployment();
  const protocolAddress = await protocol.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(protocolAddress);
  const deploymentReceipt = await protocol.deploymentTransaction()?.wait();
  const deploymentBlock = deploymentReceipt?.blockNumber;

  console.log(JSON.stringify({
    network: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    proxy: protocolAddress,
    implementation: implementationAddress,
    deploymentBlock,
    token,
    working,
    nonWorking,
    club,
    development,
    genesis,
  }, null, 2));
  console.log(`\nFrontend/indexer configuration:\nPROTOCOL_PROXY_ADDRESS=${protocolAddress}\nVITE_CHAIN_ID=97\nVITE_PROTOCOL_ADDRESS=${protocolAddress}\nINDEXER_PROTOCOL_ADDRESS=${protocolAddress}\nINDEXER_START_BLOCK=${deploymentBlock ?? ""}\nVITE_RPC_URL=${process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545"}\nVITE_EXPLORER_URL=https://testnet.bscscan.com`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
