import { PrismaClient, Prisma } from "@prisma/client";
import { createPublicClient, http, zeroAddress } from "viem";
import { bscTestnet } from "viem/chains";
import { config } from "./config.js";
import { batchEnd, claimed, clubRoyaltyDistributed, decodeReason, finalBlock, participantRegistered, participationAllocated, poolIncomeQueued, rewardCredited } from "./events.js";

const prisma = new PrismaClient();
const client = createPublicClient({ chain: bscTestnet, transport: http(config.rpcUrl) });

async function reconcileReorg() {
  for (;;) {
    const checkpoint = await prisma.blockCheckpoint.findFirst({ orderBy: { blockNumber: "desc" } });
    if (!checkpoint) return config.startBlock;
    const chainBlock = await client.getBlock({ blockNumber: checkpoint.blockNumber }).catch(() => null);
    if (chainBlock?.hash === checkpoint.blockHash) return checkpoint.blockNumber + 1n;

    await prisma.$transaction([
      prisma.participant.deleteMany({ where: { blockNumber: { gte: checkpoint.blockNumber } } }),
      prisma.allocation.deleteMany({ where: { blockNumber: { gte: checkpoint.blockNumber } } }),
      prisma.rewardCredit.deleteMany({ where: { blockNumber: { gte: checkpoint.blockNumber } } }),
      prisma.claim.deleteMany({ where: { blockNumber: { gte: checkpoint.blockNumber } } }),
      prisma.poolQueue.deleteMany({ where: { blockNumber: { gte: checkpoint.blockNumber } } }),
      prisma.clubRoyalty.deleteMany({ where: { blockNumber: { gte: checkpoint.blockNumber } } }),
      prisma.blockCheckpoint.delete({ where: { blockNumber: checkpoint.blockNumber } }),
    ]);
  }
}

async function processRange(fromBlock: bigint, toBlock: bigint) {
  // One request at a time: public RPC nodes rate-limit bursts of parallel eth_getLogs calls.
  const registrations = await client.getLogs({ address: config.protocol, event: participantRegistered, fromBlock, toBlock });
  const allocations = await client.getLogs({ address: config.protocol, event: participationAllocated, fromBlock, toBlock });
  const credits = await client.getLogs({ address: config.protocol, event: rewardCredited, fromBlock, toBlock });
  const claims = await client.getLogs({ address: config.protocol, event: claimed, fromBlock, toBlock });
  const queued = await client.getLogs({ address: config.protocol, event: poolIncomeQueued, fromBlock, toBlock });
  const royalties = await fetchClubRoyalty(fromBlock, toBlock);
  const endBlock = await client.getBlock({ blockNumber: toBlock });

  await prisma.$transaction(async (tx) => {
    for (const log of registrations) {
      const { account, sponsor, memberId, joinedAt } = log.args;
      if (!account || sponsor === undefined || memberId === undefined || joinedAt === undefined || log.logIndex === null) continue;
      await tx.participant.upsert({
        where: { address: account.toLowerCase() },
        create: {
          address: account.toLowerCase(),
          sponsor: sponsor === zeroAddress ? null : sponsor.toLowerCase(),
          memberId,
          joinedAt: new Date(Number(joinedAt) * 1000),
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        },
        update: {},
      });
    }
    const sponsors = [...new Set(registrations
      .map((log) => log.args.sponsor)
      .filter((sponsor): sponsor is `0x${string}` => Boolean(sponsor && sponsor !== zeroAddress))
      .map((sponsor) => sponsor.toLowerCase()))];
    for (const sponsor of sponsors) {
      const directCount = await tx.participant.count({ where: { sponsor } });
      await tx.participant.updateMany({ where: { address: sponsor }, data: { directCount } });
    }
    for (const log of allocations) {
      const { account, workingAmount, nonWorkingAmount, clubAmount } = log.args;
      if (!account || workingAmount === undefined || nonWorkingAmount === undefined || clubAmount === undefined || log.logIndex === null) continue;
      await tx.allocation.upsert({
        where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
        create: {
          account: account.toLowerCase(),
          workingAmount: new Prisma.Decimal(workingAmount.toString()),
          nonWorkingAmount: new Prisma.Decimal(nonWorkingAmount.toString()),
          clubAmount: new Prisma.Decimal(clubAmount.toString()),
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        },
        update: {},
      });
    }
    for (const log of credits) {
      const { account, amount, reason } = log.args;
      if (!account || amount === undefined || !reason || log.logIndex === null) continue;
      await tx.rewardCredit.upsert({
        where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
        create: {
          account: account.toLowerCase(),
          amount: new Prisma.Decimal(amount.toString()),
          reason: decodeReason(reason),
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        },
        update: {},
      });
    }
    for (const log of claims) {
      const { account, gross, net, royalty, development } = log.args;
      if (!account || gross === undefined || net === undefined || royalty === undefined || development === undefined || log.logIndex === null) continue;
      await tx.claim.upsert({
        where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
        create: {
          account: account.toLowerCase(),
          gross: new Prisma.Decimal(gross.toString()),
          net: new Prisma.Decimal(net.toString()),
          royalty: new Prisma.Decimal(royalty.toString()),
          development: new Prisma.Decimal(development.toString()),
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        },
        update: {},
      });
    }
    await storePoolQueue(tx, queued);
    await storeClubRoyalty(tx, royalties);
    await tx.blockCheckpoint.upsert({
      where: { blockNumber: toBlock },
      create: { blockNumber: toBlock, blockHash: endBlock.hash },
      update: { blockHash: endBlock.hash },
    });
  });
}

type QueueLog = Awaited<ReturnType<typeof fetchPoolQueue>>[number];
function fetchPoolQueue(fromBlock: bigint, toBlock: bigint) {
  return client.getLogs({ address: config.protocol, event: poolIncomeQueued, fromBlock, toBlock });
}
async function storePoolQueue(tx: Prisma.TransactionClient, logs: QueueLog[]) {
  for (const log of logs) {
    const { account, pool, level, amount } = log.args;
    if (!account || pool === undefined || level === undefined || amount === undefined || log.logIndex === null) continue;
    await tx.poolQueue.upsert({
      where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
      create: {
        account: account.toLowerCase(), pool, level,
        amount: new Prisma.Decimal(amount.toString()),
        blockNumber: log.blockNumber, txHash: log.transactionHash, logIndex: log.logIndex,
      },
      update: {},
    });
  }
}

type RoyaltyLog = Awaited<ReturnType<typeof fetchClubRoyalty>>[number];
function fetchClubRoyalty(fromBlock: bigint, toBlock: bigint) {
  return client.getLogs({ address: config.protocol, event: clubRoyaltyDistributed, fromBlock, toBlock });
}
async function storeClubRoyalty(tx: Prisma.TransactionClient, logs: RoyaltyLog[]) {
  for (const log of logs) {
    const { rank, amount, members } = log.args;
    if (rank === undefined || amount === undefined || members === undefined || log.logIndex === null) continue;
    await tx.clubRoyalty.upsert({
      where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
      create: {
        rank, amount: new Prisma.Decimal(amount.toString()), members,
        blockNumber: log.blockNumber, txHash: log.transactionHash, logIndex: log.logIndex,
      },
      update: {},
    });
  }
}

/** One-off: load ClubRoyaltyDistributed events from the start block up to the last indexed block. Idempotent. */
export async function backfillClubRoyalty() {
  const checkpoint = await prisma.blockCheckpoint.findFirst({ orderBy: { blockNumber: "desc" } });
  if (!checkpoint) return 0;
  let stored = 0;
  for (let cursor = config.startBlock; cursor <= checkpoint.blockNumber;) {
    const end = batchEnd(cursor, checkpoint.blockNumber, config.batchSize);
    const logs = await fetchClubRoyalty(cursor, end);
    await prisma.$transaction(async (tx) => storeClubRoyalty(tx, logs));
    stored += logs.length;
    cursor = end + 1n;
  }
  return stored;
}

/** One-off: load PoolIncomeQueued events from the start block up to the last indexed block. Idempotent. */
export async function backfillPoolQueue() {
  const checkpoint = await prisma.blockCheckpoint.findFirst({ orderBy: { blockNumber: "desc" } });
  if (!checkpoint) return 0;
  let stored = 0;
  for (let cursor = config.startBlock; cursor <= checkpoint.blockNumber;) {
    const end = batchEnd(cursor, checkpoint.blockNumber, config.batchSize);
    const logs = await fetchPoolQueue(cursor, end);
    await prisma.$transaction(async (tx) => storePoolQueue(tx, logs));
    stored += logs.length;
    cursor = end + 1n;
  }
  return stored;
}

/** True when an RPC node rejected a request for covering too many blocks or results. */
function isRangeLimit(error: unknown) {
  const text = `${(error as { code?: number })?.code ?? ""} ${(error as Error)?.message ?? ""}`.toLowerCase();
  return /-32005|-32600|-32602|limit exceeded|exceeds defined limit|block range|too many|range is too large|query returned more than/.test(text);
}

let batchSize = config.batchSize;

export async function syncOnce() {
  let cursor = await reconcileReorg();
  const head = await client.getBlockNumber();
  const target = finalBlock(head, config.confirmations);
  while (cursor <= target) {
    const end = batchEnd(cursor, target, batchSize);
    try {
      await processRange(cursor, end);
    } catch (error) {
      // Shrink the block range and retry instead of failing the whole pass.
      if (!isRangeLimit(error) || batchSize <= 10n) throw error;
      batchSize = batchSize / 2n;
      console.warn(`RPC limit hit; retrying with ${batchSize} blocks per request`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    cursor = end + 1n;
  }
  return { head, indexedThrough: target };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--backfill-pool-queue")) {
    const stored = await backfillPoolQueue();
    console.log(`Backfilled ${stored} PoolIncomeQueued events`);
    process.exit(0);
  }
  if (process.argv.includes("--backfill-club-royalty")) {
    const stored = await backfillClubRoyalty();
    console.log(`Backfilled ${stored} ClubRoyaltyDistributed events`);
    process.exit(0);
  }
  const watch = process.argv.includes("--watch");
  const intervalMs = Number(process.env.INDEXER_INTERVAL_MS ?? 15_000);
  const run = async () => {
    const { head, indexedThrough } = await syncOnce();
    console.log(`Indexed through ${indexedThrough} (head ${head})`);
  };
  if (!watch) {
    run().finally(() => prisma.$disconnect());
  } else {
    let stopped = false;
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopped = true; });
    (async () => {
      while (!stopped) {
        await run().catch((error) => console.error("Indexer pass failed, retrying:", error));
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      await prisma.$disconnect();
    })();
  }
}
