import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { apiBaseUrl } from "./config";

export type IncomeHistory = {
  indexedThrough: string | null;
  totals: Record<string, { amount: string; count: number }>;
  lifetimeCredited: string;
  claims: { count: number; gross: string; net: string; royalty: string; development: string };
  recent: { reason: string; amount: string; blockNumber: string; txHash: string }[];
};

export type DirectReferral = {
  address: Address;
  memberId: string;
  directCount: number;
  joinedAt: string;
};

export type SingleLegTeamMember = DirectReferral & {
  sponsor: Address;
  depth: number;
};

/** Labels for every reason code the contract passes to `_credit`. */
export const incomeStreams = [
  { reason: "DIRECT_INCOME", name: "Working Matrix direct", note: "12 USDT from each direct referral after your first two" },
  { reason: "TEN_LEVEL_UPLINE", name: "Working Matrix upline", note: "The 10%, 4%, 2% and 0.5% Working Matrix levels" },
  { reason: "WORKING_LEVEL_INCOME", name: "Working Pool level income", note: "80% of each Working level reached, plus U1–U9 shares from your team" },
  { reason: "SINGLE_LEG_INCOME", name: "Single-Leg income", note: "Net level rewards moved from the Single-Leg reserve" },
  { reason: "NON_WORKING_MATRIX_INCOME", name: "Non-Working Matrix", note: "Matrix rewards funded by the Level 2 redirect" },
  { reason: "REENTRY", name: "Non-Working re-entry", note: "From completed Non-Working Matrix cycles" },
  { reason: "WEEKLY_SUPERSTAR", name: "Weekly Superstar", note: "The accumulated $1 registration fund for the weekly winner" },
  {
    reason: "FIVE_STAR_ROYALTY",
    name: "5 Star Club royalty",
    note: "5 Star members' weighted share of their club's 3% of every withdrawal",
  },
  {
    reason: "STAR_CLUB_ROYALTY",
    name: "Star Club royalty",
    note: "Your equal share of your 1–4 Star club's 3% of every withdrawal",
  },
] as const;

export const incomeName = (reason: string) => incomeStreams.find((s) => s.reason === reason)?.name ?? "Other reward";

/** Lifetime income history from the indexer. `isError` means the history service is unreachable. */
export function useIncomeHistory(address?: Address) {
  return useQuery({
    queryKey: ["income", address?.toLowerCase()],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async (): Promise<IncomeHistory> => {
      const response = await fetch(`${apiBaseUrl}/api/participants/${address}/income`);
      if (!response.ok) throw new Error(`History service returned ${response.status}`);
      const body = await response.json() as IncomeHistory;
      if (!body || typeof body.totals !== "object") throw new Error("Unexpected history response");
      return body;
    },
  });
}

/** Direct members indexed from ParticipantRegistered events. */
export function useDirectReferrals(address?: Address) {
  return useQuery({
    queryKey: ["direct-referrals", address?.toLowerCase()],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async (): Promise<DirectReferral[]> => {
      const response = await fetch(`${apiBaseUrl}/api/participants/${address}/referrals`);
      if (!response.ok) throw new Error(`Referral service returned ${response.status}`);
      return await response.json() as DirectReferral[];
    },
  });
}

/** Complete sponsor downline, limited to the same ten levels counted by the contract. */
export function useSingleLegTeam(address?: Address) {
  return useQuery({
    queryKey: ["single-leg-team", address?.toLowerCase()],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async (): Promise<SingleLegTeamMember[]> => {
      const response = await fetch(`${apiBaseUrl}/api/participants/${address}/team`);
      if (!response.ok) throw new Error(`Team service returned ${response.status}`);
      return await response.json() as SingleLegTeamMember[];
    },
  });
}
