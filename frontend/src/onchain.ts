import { useQuery } from "@tanstack/react-query";
import { keccak256, toHex, type Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { chainId, protocolAddress } from "./config";
import { protocolAbi } from "./contracts/abi";
import { incomeStreams, type IncomeHistory, type SingleLegTeamMember } from "./income";

/** Default depth for team lists (Single-Leg counts 10 levels); the Working matrix reads 15. */
const MAX_TEAM_DEPTH = 10;
/** Stops the walk on very large teams; the contract's teamCount still reports the true size. */
const MAX_TEAM_MEMBERS = 2_000;
const PAGE = 5_000n;

/**
 * The 10-level sponsor team read straight from the contract: each level's members come from
 * `getDirectReferrals` of the level above, and member details from `getParticipant`.
 */
export function useOnchainTeam(address?: Address, maxDepth = MAX_TEAM_DEPTH) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["onchain-team", address?.toLowerCase(), maxDepth],
    enabled: Boolean(address && client && protocolAddress),
    refetchInterval: 30_000,
    queryFn: async (): Promise<SingleLegTeamMember[]> => {
      if (!address || !client || !protocolAddress) return [];
      const team: SingleLegTeamMember[] = [];
      let frontier: Address[] = [address];
      for (let depth = 1; depth <= maxDepth && frontier.length > 0 && team.length < MAX_TEAM_MEMBERS; depth++) {
        const lists = await client.multicall({
          allowFailure: false,
          contracts: frontier.map(sponsor => ({ address: protocolAddress!, abi: protocolAbi, functionName: "getDirectReferrals" as const, args: [sponsor, 0n, PAGE] as const })),
        });
        const level = lists.flatMap((members, index) => (members as readonly Address[]).map(member => ({ member, sponsor: frontier[index] })));
        if (level.length === 0) break;
        const details = await client.multicall({
          allowFailure: false,
          contracts: level.map(({ member }) => ({ address: protocolAddress!, abi: protocolAbi, functionName: "getParticipant" as const, args: [member] as const })),
        });
        level.forEach(({ member, sponsor }, index) => {
          const participant = details[index] as { id: bigint; directCount: bigint; joinedAt: bigint };
          team.push({
            address: member,
            sponsor,
            depth,
            memberId: participant.id.toString(),
            directCount: Number(participant.directCount),
            joinedAt: new Date(Number(participant.joinedAt) * 1000).toISOString(),
          });
        });
        frontier = level.map(({ member }) => member);
      }
      return team;
    },
  });
}

export type LinePosition = { position: number; address: Address; memberId: string; reentry: boolean };

/**
 * The global Single-Leg line (first come, first served): your positions and the next `limit`
 * positions after your first one, read from `singleLegInfo` and `lineOwnerAt`.
 */
export function useSingleLegLine(address?: Address, limit = 50) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["single-leg-line", address?.toLowerCase(), limit],
    enabled: Boolean(address && client && protocolAddress),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!address || !client || !protocolAddress) return undefined;
      const [primary, primaryLevel, reentry, reentryLevel, line] = await client.readContract({ address: protocolAddress, abi: protocolAbi, functionName: "singleLegInfo", args: [address] }) as readonly [bigint, number, bigint, number, bigint];
      const first = Number(primary) + 1;
      const last = Math.min(Number(line), Number(primary) + limit);
      const positions = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
      const owners = positions.length ? await client.multicall({ allowFailure: false, contracts: positions.map(position => ({ address: protocolAddress!, abi: protocolAbi, functionName: "lineOwnerAt" as const, args: [BigInt(position)] as const })) }) as Address[] : [];
      const details = owners.length ? await client.multicall({ allowFailure: false, contracts: owners.map(owner => ({ address: protocolAddress!, abi: protocolAbi, functionName: "getParticipant" as const, args: [owner] as const })) }) as { id: bigint }[] : [];
      const reentries = owners.length ? await client.multicall({ allowFailure: false, contracts: owners.map(owner => ({ address: protocolAddress!, abi: protocolAbi, functionName: "reentryPosition" as const, args: [owner] as const })) }) as bigint[] : [];
      const after: LinePosition[] = positions.map((position, index) => ({
        position, address: owners[index], memberId: details[index].id.toString(), reentry: reentries[index] === BigInt(position),
      }));
      return {
        primary: Number(primary), primaryLevel: Number(primaryLevel), reentry: Number(reentry), reentryLevel: Number(reentryLevel),
        line: Number(line), team: Number(line) - Number(primary), reentryTeam: reentry ? Number(line) - Number(reentry) : 0, after,
      };
    },
  });
}

/** Direct referrals from the contract, in join order. */
export function useOnchainDirects(address?: Address) {
  const team = useOnchainTeam(address);
  return { ...team, data: team.data?.filter(member => member.depth === 1) };
}

const LEDGER_REASONS = incomeStreams.map(stream => stream.reason);

/**
 * Lifetime income per stream, lifetime earned and withdrawals from the contract's ledger.
 * `earlier` is income credited before the ledger existed (lifetime minus the per-stream sum).
 * Recent activity (with transaction links) still comes from the indexer's event history.
 */
export function useOnchainIncome(address: Address | undefined, rules: ProtocolRules, recent: IncomeHistory["recent"] = []) {
  const contracts = address && protocolAddress ? [
    ...LEDGER_REASONS.flatMap(reason => {
      const hash = keccak256(toHex(reason));
      return [
        { address: protocolAddress, abi: protocolAbi, chainId, functionName: "incomeByReason" as const, args: [address, hash] as const },
        { address: protocolAddress, abi: protocolAbi, chainId, functionName: "incomeCountByReason" as const, args: [address, hash] as const },
      ];
    }),
    { address: protocolAddress, abi: protocolAbi, chainId, functionName: "lifetimeEarned" as const, args: [address] as const },
    { address: protocolAddress, abi: protocolAbi, chainId, functionName: "totalWithdrawnGross" as const, args: [address] as const },
    { address: protocolAddress, abi: protocolAbi, chainId, functionName: "withdrawCount" as const, args: [address] as const },
  ] : [];
  const reads = useReadContracts({ allowFailure: true, contracts, query: { enabled: contracts.length > 0, refetchInterval: 12_000 } });
  const results = reads.data;
  const ready = Boolean(results && results.every(result => result.status === "success"));
  let data: (IncomeHistory & { earlier: bigint; withdrawnGross: bigint }) | undefined;
  if (ready && results) {
    const totals: IncomeHistory["totals"] = {};
    let attributed = 0n;
    LEDGER_REASONS.forEach((reason, index) => {
      const amount = results[index * 2].result as bigint;
      const count = Number(results[index * 2 + 1].result as bigint);
      attributed += amount;
      if (amount > 0n || count > 0) totals[reason] = { amount: amount.toString(), count };
    });
    const base = LEDGER_REASONS.length * 2;
    const lifetime = results[base].result as bigint;
    const withdrawn = results[base + 1].result as bigint;
    const withdrawals = Number(results[base + 2].result as bigint);
    const royalty = withdrawn * rules.royaltyBps / 10_000n;
    const development = withdrawn * rules.developmentBps / 10_000n;
    data = {
      indexedThrough: null,
      totals,
      lifetimeCredited: lifetime.toString(),
      claims: { count: withdrawals, gross: withdrawn.toString(), net: (withdrawn - royalty - development).toString(), royalty: royalty.toString(), development: development.toString() },
      recent,
      earlier: lifetime > attributed ? lifetime - attributed : 0n,
      withdrawnGross: withdrawn,
    };
  }
  return { data, isLoading: reads.isLoading, isError: reads.isError || Boolean(results && !ready), refetch: reads.refetch };
}

export type RankRule = { directs: number; qualifiedLevel: number; qualifiedCount: number; cap: bigint; capMultiple: number | null };
export type ProtocolRules = {
  loaded: boolean;
  royaltyBps: bigint;
  developmentBps: bigint;
  directShareBps: bigint;
  activationDirects: number;
  superstarMinDirects: number;
  /** Total directs needed to claim each star club's royalty, indexed by rank (1–5). */
  clubClaimDirects: number[];
  ticketPrice: bigint;
  workingAllocation: bigint;
  uplineBps: bigint[];
  ranks: Record<number, RankRule>;
};

/** Defaults match the deployed contract; they only show until the contract reads arrive. */
const FALLBACK: ProtocolRules = {
  loaded: false,
  royaltyBps: 1_500n,
  developmentBps: 500n,
  directShareBps: 8_000n,
  activationDirects: 2,
  superstarMinDirects: 5,
  clubClaimDirects: [0, 0, 4, 8, 12, 16],
  ticketPrice: 25_000_000n,
  workingAllocation: 15_000_000n,
  uplineBps: [1_000n, 400n, 200n, 50n, 50n, 50n, 50n, 50n, 50n],
  ranks: {
    1: { directs: 0, qualifiedLevel: 0, qualifiedCount: 0, cap: 50_000_000n, capMultiple: 2 },
    2: { directs: 4, qualifiedLevel: 0, qualifiedCount: 0, cap: 125_000_000n, capMultiple: 5 },
    3: { directs: 0, qualifiedLevel: 2, qualifiedCount: 16, cap: 250_000_000n, capMultiple: 10 },
    4: { directs: 0, qualifiedLevel: 3, qualifiedCount: 64, cap: 1_250_000_000n, capMultiple: 50 },
    5: { directs: 0, qualifiedLevel: 4, qualifiedCount: 300, cap: 2n ** 256n - 1n, capMultiple: null },
  },
};

const MAX_UINT = 2n ** 256n - 1n;

/** Programme rules read from the contract: fees, shares, Superstar minimum and every rank's requirements and cap. */
export function useProtocolRules(): ProtocolRules {
  const base = protocolAddress ? { address: protocolAddress, abi: protocolAbi, chainId } : undefined;
  const contracts = base ? [
    { ...base, functionName: "ROYALTY_BPS" as const },
    { ...base, functionName: "DEVELOPMENT_BPS" as const },
    { ...base, functionName: "DIRECT_SHARE_BPS" as const },
    { ...base, functionName: "ACTIVATION_DIRECTS" as const },
    { ...base, functionName: "SUPERSTAR_MIN_DIRECTS" as const },
    { ...base, functionName: "ticketPrice" as const },
    { ...base, functionName: "workingAllocation" as const },
    ...[1, 2, 3, 4, 5].map(rank => ({ ...base, functionName: "rankRule" as const, args: [rank] as const })),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => ({ ...base, functionName: "tenLevelPercentageBps" as const, args: [level] as const })),
    ...[1, 2, 3, 4, 5].map(rank => ({ ...base, functionName: "clubClaimDirects" as const, args: [rank] as const })),
  ] : [];
  const reads = useReadContracts({ allowFailure: true, contracts, query: { enabled: contracts.length > 0, staleTime: 300_000 } });
  const r = reads.data;
  if (!r || r.some(result => result.status !== "success")) return FALLBACK;
  const ticketPrice = r[5].result as bigint;
  const ranks: Record<number, RankRule> = {};
  [1, 2, 3, 4, 5].forEach((rank, index) => {
    const [directs, qualifiedLevel, qualifiedCount, cap] = r[7 + index].result as readonly [bigint, number, bigint, bigint];
    ranks[rank] = {
      directs: Number(directs), qualifiedLevel: Number(qualifiedLevel), qualifiedCount: Number(qualifiedCount), cap,
      capMultiple: cap === MAX_UINT || ticketPrice === 0n ? null : Number(cap / ticketPrice),
    };
  });
  return {
    loaded: true,
    royaltyBps: r[0].result as bigint,
    developmentBps: r[1].result as bigint,
    directShareBps: r[2].result as bigint,
    activationDirects: Number(r[3].result as bigint),
    superstarMinDirects: Number(r[4].result as bigint),
    clubClaimDirects: [0, ...r.slice(21, 26).map(result => Number(result.result as bigint))],
    ticketPrice,
    workingAllocation: r[6].result as bigint,
    uplineBps: r.slice(12, 21).map(result => result.result as bigint),
    ranks,
  };
}
