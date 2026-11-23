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

type LedgerRow = {
  kind: "credit" | "withdrawal";
  reason: string | null;
  amount: Prisma.Decimal;
  net: Prisma.Decimal | null;
  royalty: Prisma.Decimal | null;
  development: Prisma.Decimal | null;
  blockNumber: bigint;
  txHash: string;
  logIndex: number;
};

type CreditSource = { member?: { address: string; memberId: string }; depth?: number; note: string };
const UPLINE_PERCENT = ["10%", "4%", "2%", "0.5%", "0.5%", "0.5%", "0.5%", "0.5%", "0.5%"];

/**
 * Explains where each credit came from. Events carry no source, but a registration in the same
 * transaction identifies the member who triggered direct and upline income; the sponsor chain
 * gives their level in the account's team.
 */
async function creditSources(account: string, rows: LedgerRow[]) {
  const result = new Map<string, CreditSource>();
  const credits = rows.filter((row) => row.kind === "credit");
  if (credits.length === 0) return result;
  const joined = await prisma.participant.findMany({ where: { txHash: { in: [...new Set(credits.map((row) => row.txHash))] } } });
  const joinedByTx = new Map(joined.map((member) => [member.txHash, member]));
  const sponsorOf = new Map<string, string | null>();
  const lookup = async (addresses: string[]) => {
    const missing = addresses.filter((address) => !sponsorOf.has(address));
    if (missing.length === 0) return;
    for (const member of await prisma.participant.findMany({ where: { address: { in: missing } }, select: { address: true, sponsor: true } })) {
      sponsorOf.set(member.address, member.sponsor);
    }
    for (const address of missing) if (!sponsorOf.has(address)) sponsorOf.set(address, null);
  };
  /** How many levels below `account` the member sits (1 = direct), up to 10. */
  const depthOf = async (member: string) => {
    let current: string | null = member;
    for (let depth = 1; depth <= 10 && current; depth++) {
      await lookup([current]);
      const sponsor: string | null = sponsorOf.get(current) ?? null;
      if (sponsor === account) return depth;
      current = sponsor;
    }
    return undefined;
  };
  for (const row of credits) {
    const key = `${row.txHash}:${row.logIndex}`;
    const member = joinedByTx.get(row.txHash);
    const who = member ? { address: member.address, memberId: member.memberId.toString() } : undefined;
    const label = who ? `Member #${who.memberId}` : "a member";
    switch (row.reason) {
      case "DIRECT_INCOME":
        result.set(key, { member: who, depth: 1, note: `From your direct ${label} joining (80% of their 15 USDT Working share)` });
        break;
      case "TEN_LEVEL_UPLINE": {
        const depth = member ? await depthOf(member.address) : undefined;
        const uplineLevel = depth ? depth - 1 : undefined;
        result.set(key, {
          member: who, depth,
          note: depth
            ? `${label} joined ${depth} levels below you · your Level ${uplineLevel} upline share (${UPLINE_PERCENT[(uplineLevel ?? 1) - 1]})`
            : `${label} joining in your team · upline share`,
        });
        break;
      }
      case "REENTRY":
        result.set(key, { member: who, note: `Non-Working re-entry cycle, triggered by ${label} joining your team` });
        break;
      case "WORKING_LEVEL_INCOME":
        result.set(key, { note: "Moved from your Working pool: Working levels you reached and U1–U9 shares from your team" });
        break;
      case "SINGLE_LEG_INCOME":
        result.set(key, { note: "Moved from your Single-Leg pool: Single-Leg levels you reached and Upline 1/2 shares from your directs' line" });
        break;
      case "NON_WORKING_MATRIX_INCOME":
        result.set(key, { note: "Moved from your Non-Working pool: Non-Working levels you reached and upline shares from your team" });
        break;
      case "STAR_CLUB_ROYALTY":
        result.set(key, { note: "Your 1–4 Star club's share of 3% of every member's withdrawal" });
        break;
      case "FIVE_STAR_ROYALTY":
        result.set(key, { note: "Your 5 Star club's weighted share of 3% of every member's withdrawal" });
        break;
      case "WEEKLY_SUPERSTAR":
        result.set(key, { note: "Weekly Superstar winner: the accumulated $1-per-registration fund" });
        break;
      default:
        result.set(key, { note: "Protocol reward" });
    }
  }
  return result;
}

/** Every income credit and withdrawal for an account, newest first, paged. */
app.get<{ Params: { address: string }; Querystring: { kind?: string; reason?: string; page?: string; pageSize?: string } }>(
  "/api/participants/:address/ledger",
  async (request, reply) => {
    const address = request.params.address.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) return reply.code(400).send({ error: "Invalid address" });
    const kind = request.query.kind === "credit" || request.query.kind === "withdrawal" ? request.query.kind : "all";
    const reason = request.query.reason && /^[A-Z0-9_]{1,64}$/.test(request.query.reason) ? request.query.reason : null;
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 25));
    const page = Math.max(1, Number(request.query.page) || 1);
    const credits = Prisma.sql`
      SELECT 'credit' AS kind, reason, amount, NULL::numeric AS net, NULL::numeric AS royalty, NULL::numeric AS development,
             "blockNumber", "txHash", "logIndex"
      FROM "RewardCredit" WHERE account = ${address} ${reason ? Prisma.sql`AND reason = ${reason}` : Prisma.empty}`;
    const withdrawals = Prisma.sql`
      SELECT 'withdrawal' AS kind, NULL AS reason, gross AS amount, net, royalty, development, "blockNumber", "txHash", "logIndex"
      FROM "Claim" WHERE account = ${address}`;
    const union = kind === "credit" || reason ? credits : kind === "withdrawal" ? withdrawals : Prisma.sql`${credits} UNION ALL ${withdrawals}`;
    const [rows, totals] = await Promise.all([
      prisma.$queryRaw<LedgerRow[]>(Prisma.sql`SELECT * FROM (${union}) entries ORDER BY "blockNumber" DESC, "logIndex" DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM (${union}) entries`),
    ]);
    const str = (value: Prisma.Decimal | null) => (value === null ? null : value.toFixed());
    const sources = await creditSources(address, rows);
    return {
      page,
      pageSize,
      total: Number(totals[0]?.count ?? 0),
      entries: rows.map((row) => ({
        source: sources.get(`${row.txHash}:${row.logIndex}`) ?? null,
        kind: row.kind,
        reason: row.reason,
        amount: str(row.amount),
        net: str(row.net),
        royalty: str(row.royalty),
        development: str(row.development),
        blockNumber: row.blockNumber.toString(),
        txHash: row.txHash,
        logIndex: row.logIndex,
      })),
    };
  },
);

/** Contract Single-Leg Upline 1/2 amounts (USDT) per level; the member's own share is the rest of the event. */
const SINGLE_LEG_UPLINE = [1, 2, 3, 5, 10, 30, 100, 400, 1_000, 2_500];
const POOL_NAMES: Record<number, string> = { 1: "Single-Leg", 2: "Working", 3: "Non-Working" };

/**
 * Where an account's pool income came from: its own pool levels, and its share of levels reached by
 * members below it (Single-Leg: Upline 1–2; Working / Non-Working: U1 10%, U2–U9 1.25% each).
 */
app.get<{ Params: { address: string }; Querystring: { pool?: string } }>("/api/participants/:address/pool-sources", async (request, reply) => {
  const address = request.params.address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return reply.code(400).send({ error: "Invalid address" });
  const pool = Number(request.query.pool);
  if (![1, 2, 3].includes(pool)) return reply.code(400).send({ error: "pool must be 1, 2 or 3" });
  const maxDepth = pool === 1 ? 2 : 9;
  const team = await prisma.$queryRaw<{ address: string; memberId: bigint; depth: number }[]>(Prisma.sql`
    WITH RECURSIVE team AS (
      SELECT p.address, p."memberId", 1 AS depth FROM "Participant" p WHERE p.sponsor = ${address}
      UNION ALL
      SELECT p.address, p."memberId", team.depth + 1 FROM "Participant" p INNER JOIN team ON p.sponsor = team.address
      WHERE team.depth < ${maxDepth}
    )
    SELECT * FROM team`);
  const depthOf = new Map(team.map((member) => [member.address, member]));
  const rows = await prisma.poolQueue.findMany({
    where: { pool, account: { in: [address, ...team.map((member) => member.address)] } },
    orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
    take: 200,
  });
  const unit = 1_000_000n;
  // A level is queued once per account; if a rule change re-queued it, the latest event is the one that stands.
  const seen = new Set<string>();
  const latest = rows.filter((row) => {
    const key = `${row.account}:${row.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const items = latest.map((row) => {
    const amount = BigInt(row.amount.toFixed());
    const mine = row.account === address;
    const member = depthOf.get(row.account);
    let share: bigint;
    let note: string;
    const who = member ? `Member #${member.memberId} (${member.depth === 1 ? "your direct" : `${member.depth} levels below you`})` : "A team member";
    if (pool === 1) {
      const upline = BigInt(SINGLE_LEG_UPLINE[row.level - 1] ?? 0) * unit;
      share = mine ? amount - 2n * upline : upline;
      note = mine
        ? `You reached Single-Leg Level ${row.level} — your level income`
        : `${who} reached Single-Leg Level ${row.level} — your Upline ${member?.depth} share`;
    } else {
      const depth = member?.depth ?? 0;
      share = mine ? amount * 8_000n / 10_000n : depth === 1 ? amount * 1_000n / 10_000n : amount * 1_000n / 10_000n / 8n;
      note = mine
        ? `You reached ${POOL_NAMES[pool]} Level ${row.level} — your 80% of the level's distributable`
        : `${who} reached ${POOL_NAMES[pool]} Level ${row.level} — your ${depth === 1 ? "U1 10%" : `U${depth} 1.25%`} share`;
    }
    return {
      own: mine,
      member: mine ? null : { address: row.account, memberId: member?.memberId.toString() ?? null, depth: member?.depth ?? null },
      pool, level: row.level,
      levelAmount: amount.toString(),
      share: share.toString(),
      note,
      blockNumber: row.blockNumber.toString(),
      txHash: row.txHash,
    };
  });
  return { pool, items };
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
