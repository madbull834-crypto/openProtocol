import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { HardhatUserConfig } from "hardhat/config";
import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

loadEnv({ path: path.resolve(__dirname, "../.env"), quiet: true });

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion === "0.8.28") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: solcVersion,
      longVersion: "0.8.28+commit.7893614a",
    };
  }
  return runSuper();
});

const key = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    // Optimize for deployable bytecode size; this upgradeable prototype is close to the EIP-170 limit.
    settings: { optimizer: { enabled: true, runs: 1 }, viaIR: true },
  },
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: key ? [key] : [],
      // BSC Testnet rejects priority fees under 0.1 gwei; ethers' estimate can fall below that.
      gasPrice: 1_000_000_000,
    },
  },
  etherscan: {
    apiKey: { bscTestnet: process.env.BSCSCAN_API_KEY ?? "" },
  },
  paths: { sources: "src", tests: "test" },
};

export default config;
