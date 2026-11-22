import Fastify from "fastify";
import cors from "@fastify/cors";
import { Prisma, PrismaClient } from "@prisma/client";

const app = Fastify({ logger: true });
const prisma = new PrismaClient();
await app.register(cors, { origin: true, methods: ["GET"] });

app.get("/health", async () => ({ ok: true }));
app.get("/api/stats", async () => {
  const [members, allocation, checkpoint] = await Promise.all([
    prisma.participant.count(),
    prisma.allocation.aggregate({ _sum: { workingAmount: true, nonWorkingAmount: true, clubAmount: true } }),
    prisma.blockCheckpoint.findFirst({ orderBy: { blockNumber: "desc" } }),
  ]);
  return { members, allocation: allocation._sum, indexedThrough: checkpoint?.blockNumber.toString() ?? null };
});
app.get<{ Params: { address: string } }>("/api/participants/:address", async (request, reply) => {
  const participant = await prisma.participant.findUnique({ where: { address: request.params.address.toLowerCase() } });
  if (!participant) return reply.code(404).send({ error: "Participant not found" });
  return { ...participant, memberId: participant.memberId.toString(), blockNumber: participant.blockNumber.toString() };
});
app.get<{ Params: { address: string } }>("/api/participants/:address/referrals", async (request) => {
  const referrals = await prisma.participant.findMany({ where: { sponsor: request.params.address.toLowerCase() }, orderBy: { memberId: "asc" } });
  return referrals.map((item) => ({ ...item, memberId: item.memberId.toString(), blockNumber: item.blockNumber.toString() }));
});

type TeamRow = {
  address: string;
  sponsor: string;
  memberId: bigint;
  directCount: number;
  joinedAt: Date;
  blockNumber: bigint;
  depth: number;
};

app.get<{ Params: { address: string } }>("/api/participants/:address/team", async (request, reply) => {
  const address = request.params.address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return reply.code(400).send({ error: "Invalid address" });
  const team = await prisma.$queryRaw<TeamRow[]>(Prisma.sql`
    WITH RECURSIVE team AS (
      SELECT p.address, p.sponsor, p."memberId", p."directCount", p."joinedAt", p."blockNumber", 1 AS depth
      FROM "Participant" p
      WHERE p.sponsor = ${address}
      UNION ALL
      SELECT p.address, p.sponsor, p."memberId", p."directCount", p."joinedAt", p."blockNumber", team.depth + 1
      FROM "Participant" p
      INNER JOIN team ON p.sponsor = team.address
      WHERE team.depth < 10
    )
    SELECT * FROM team ORDER BY depth ASC, "memberId" ASC
  `);
  return team.map((member) => ({
    ...member,
    memberId: member.memberId.toString(),
    blockNumber: member.blockNumber.toString(),
  }));
});

app.get<{ Params: { address: string } }>("/api/participants/:address/income", async (request, reply) => {
  const address = request.params.address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return reply.code(400).send({ error: "Invalid address" });
  const [byReason, claimTotals, recent, checkpoint] = await Promise.all([
    prisma.rewardCredit.groupBy({ by: ["reason"], where: { account: address }, _sum: { amount: true }, _count: true }),
    prisma.claim.aggregate({ where: { account: address }, _sum: { gross: true, net: true, royalty: true, development: true }, _count: true }),
    prisma.rewardCredit.findMany({ where: { account: address }, orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }], take: 25 }),
    prisma.blockCheckpoint.findFirst({ orderBy: { blockNumber: "desc" } }),
  ]);
  const str = (value: { toFixed(): string } | null | undefined) => value ? value.toFixed() : "0";
  return {
    indexedThrough: checkpoint?.blockNumber.toString() ?? null,
    totals: Object.fromEntries(byReason.map((row) => [row.reason, { amount: str(row._sum.amount), count: row._count }])),
    lifetimeCredited: str(byReason.reduce((sum, row) => sum.plus(row._sum.amount ?? 0), new Prisma.Decimal(0))),
    claims: {
      count: claimTotals._count,
      gross: str(claimTotals._sum.gross),
      net: str(claimTotals._sum.net),
      royalty: str(claimTotals._sum.royalty),
      development: str(claimTotals._sum.development),
    },
    recent: recent.map((row) => ({ reason: row.reason, amount: row.amount.toFixed(), blockNumber: row.blockNumber.toString(), txHash: row.txHash })),
  };
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
}
