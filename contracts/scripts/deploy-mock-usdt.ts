import { ethers } from "hardhat";

const INITIAL_TEST_BALANCE = 1_000_000n * 10n ** 6n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const nativeBalance = await ethers.provider.getBalance(deployer.address);

  console.log(`Deploying MockUSDT on chain ${network.chainId} from ${deployer.address}`);
  console.log(`Deployer native balance: ${ethers.formatEther(nativeBalance)}`);

  const factory = await ethers.getContractFactory("MockUSDT");
  const token = await factory.deploy();
  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  const mint = await token.mint(deployer.address, INITIAL_TEST_BALANCE);
  await mint.wait();

  console.log(JSON.stringify({
    network: network.chainId.toString(),
    deployer: deployer.address,
    token: tokenAddress,
    symbol: await token.symbol(),
    decimals: Number(await token.decimals()),
    deployerBalance: ethers.formatUnits(await token.balanceOf(deployer.address), 6),
  }, null, 2));
  console.log(`\nProtocol configuration:\nUSDT_ADDRESS=${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
