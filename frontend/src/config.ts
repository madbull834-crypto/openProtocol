import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bsc, bscTestnet } from "wagmi/chains";
import { http } from "wagmi";
import { getAddress, isAddress, type Address } from "viem";

export const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 97);
export const selectedChain = chainId === 56 ? bsc : bscTestnet;
const configuredAddress = import.meta.env.VITE_PROTOCOL_ADDRESS?.trim();
export const deploymentError = configuredAddress && !isAddress(configuredAddress)
  ? "VITE_PROTOCOL_ADDRESS is not a valid EVM contract address."
  : undefined;
export const protocolAddress = (configuredAddress && isAddress(configuredAddress) ? getAddress(configuredAddress) : undefined) as Address | undefined;
export const explorerUrl = import.meta.env.VITE_EXPLORER_URL ?? selectedChain.blockExplorers.default.url;

export const wagmiConfig = getDefaultConfig({
  appName: "Open Protocol",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000",
  chains: [selectedChain],
  transports: { [selectedChain.id]: http(import.meta.env.VITE_RPC_URL) },
});
