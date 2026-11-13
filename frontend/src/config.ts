import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bsc, bscTestnet } from "wagmi/chains";
import { http } from "wagmi";
import type { Address } from "viem";

export const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 97);
export const selectedChain = chainId === 56 ? bsc : bscTestnet;
export const protocolAddress = (import.meta.env.VITE_PROTOCOL_ADDRESS || undefined) as Address | undefined;
export const explorerUrl = import.meta.env.VITE_EXPLORER_URL ?? selectedChain.blockExplorers.default.url;

export const wagmiConfig = getDefaultConfig({
  appName: "Open Protocol",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000",
  chains: [selectedChain],
  transports: { [selectedChain.id]: http(import.meta.env.VITE_RPC_URL) },
});
