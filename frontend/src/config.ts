import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { bsc, bscTestnet } from "wagmi/chains";
import { createConfig, http } from "wagmi";
import { getAddress, isAddress, type Address } from "viem";

export const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 97);
export const selectedChain = chainId === 56 ? bsc : bscTestnet;
const configuredAddress = import.meta.env.VITE_PROTOCOL_ADDRESS?.trim();
export const deploymentError = configuredAddress && !isAddress(configuredAddress)
  ? "VITE_PROTOCOL_ADDRESS is not a valid EVM contract address."
  : undefined;
export const protocolAddress = (configuredAddress && isAddress(configuredAddress) ? getAddress(configuredAddress) : undefined) as Address | undefined;
const defaultTestToken = chainId === 97 ? "0x59ab714Eb2ff96869504302e38d5E8459009e84C" : undefined;
const configuredTestToken = import.meta.env.VITE_TEST_TOKEN_ADDRESS?.trim() || defaultTestToken;
export const testTokenAddress = (configuredTestToken && isAddress(configuredTestToken)
  ? getAddress(configuredTestToken)
  : undefined) as Address | undefined;
export const explorerUrl = import.meta.env.VITE_EXPLORER_URL ?? selectedChain.blockExplorers.default.url;
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();
export const walletConnectEnabled = Boolean(walletConnectProjectId);
const rpcTransport = http(import.meta.env.VITE_RPC_URL);
const transports = { [bsc.id]: rpcTransport, [bscTestnet.id]: rpcTransport };

export const wagmiConfig = walletConnectProjectId
  ? getDefaultConfig({
      appName: "Open Protocol",
      projectId: walletConnectProjectId,
      chains: [selectedChain],
      transports,
    })
  : createConfig({
      chains: [selectedChain],
      multiInjectedProviderDiscovery: true,
      connectors: connectorsForWallets(
        [{ groupName: "Detected EVM wallets", wallets: [injectedWallet] }],
        { appName: "Open Protocol", projectId: "" },
      ),
      transports,
    });
