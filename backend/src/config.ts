import "dotenv/config";
import { getAddress, type Address } from "viem";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const config = {
  rpcUrl: required("INDEXER_RPC_URL"),
  protocol: getAddress(required("INDEXER_PROTOCOL_ADDRESS")) as Address,
  startBlock: BigInt(process.env.INDEXER_START_BLOCK ?? "0"),
  confirmations: BigInt(process.env.INDEXER_CONFIRMATIONS ?? "12"),
  batchSize: BigInt(process.env.INDEXER_BATCH_SIZE ?? "1500"),
  port: Number(process.env.PORT ?? 4000),
};
