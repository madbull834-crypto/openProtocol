import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { bsc, bscTestnet } from "wagmi/chains";
import { createConfig, http } from "wagmi";
import { getAddress, isAddress, type Address } from "viem";

export const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 97);
export const selectedChain = chainId === 56 ? bsc : bscTestnet;
const suppliedProtocolAddress = import.meta.env.VITE_PROTOCOL_ADDRESS?.trim();
const defaultTestProtocol = chainId === 97 ? "0x0f89BF511e1e67fC842ed3967D81E824d3f96E72" : undefined;
const configuredAddress = suppliedProtocolAddress || defaultTestProtocol;
export const deploymentError = suppliedProtocolAddress && !isAddress(suppliedProtocolAddress)
  ? "VITE_PROTOCOL_ADDRESS is not a valid EVM contract address."
  : undefined;
export const protocolAddress = (configuredAddress && isAddress(configuredAddress) ? getAddress(configuredAddress) : undefined) as Address | undefined;
const defaultTestToken = chainId === 97 ? "0x59ab714Eb2ff96869504302e38d5E8459009e84C" : undefined;
const configuredTestToken = import.meta.env.VITE_TEST_TOKEN_ADDRESS?.trim() || defaultTestToken;
export const testTokenAddress = (configuredTestToken && isAddress(configuredTestToken)
  ? getAddress(configuredTestToken)
  : undefined) as Address | undefined;
const defaultTestSponsor = chainId === 97 ? "0x9ee6572EcE42BeD72EA265d3AE46D7c60c0489D0" : undefined;
const configuredGenesisSponsor = import.meta.env.VITE_GENESIS_SPONSOR?.trim() || defaultTestSponsor;
export const genesisSponsor = (configuredGenesisSponsor && isAddress(configuredGenesisSponsor)
  ? getAddress(configuredGenesisSponsor)
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

/** Base URL of the history API (backend indexer). Empty means same origin, served at /api. */
export const apiBaseUrl = (import.meta.env.VITE_API_URL?.trim() ?? "").replace(/\/$/, "");
