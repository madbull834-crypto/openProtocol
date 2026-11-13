import { PrismaClient, Prisma } from "@prisma/client";
import { createPublicClient, http, zeroAddress } from "viem";
import { bscTestnet } from "viem/chains";
import { config } from "./config.js";
import { batchEnd, finalBlock, participantRegistered, participationAllocated } from "./events.js";

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
      prisma.blockCheckpoint.delete({ where: { blockNumber: checkpoint.blockNumber } }),
    ]);
  }
}

async function processRange(fromBlock: bigint, toBlock: bigint) {
  const [registrations, allocations, endBlock] = await Promise.all([
    client.getLogs({ address: config.protocol, event: participantRegistered, fromBlock, toBlock }),
    client.getLogs({ address: config.protocol, event: participationAllocated, fromBlock, toBlock }),
    client.getBlock({ blockNumber: toBlock }),
  ]);

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
    await tx.blockCheckpoint.upsert({
      where: { blockNumber: toBlock },
      create: { blockNumber: toBlock, blockHash: endBlock.hash },
      update: { blockHash: endBlock.hash },
    });
  });
}

export async function syncOnce() {
  let cursor = await reconcileReorg();
  const head = await client.getBlockNumber();
  const target = finalBlock(head, config.confirmations);
  while (cursor <= target) {
    const end = batchEnd(cursor, target, config.batchSize);
    await processRange(cursor, end);
    cursor = end + 1n;
  }
  return { head, indexedThrough: target };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncOnce()
    .then(({ head, indexedThrough }) => console.log(`Indexed through ${indexedThrough} (head ${head})`))
    .finally(() => prisma.$disconnect());
}
