import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";

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

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
}
