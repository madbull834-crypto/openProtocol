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

/** Labels for every reason code the contract passes to `_credit`. */
export const incomeStreams = [
  { reason: "DIRECT_INCOME", name: "Direct income", note: "From members you personally referred" },
  { reason: "TEN_LEVEL_UPLINE", name: "Ten-level upline", note: "From registrations up to ten levels below you" },
  { reason: "MATRIX_INCOME", name: "Global Matrix", note: "From members placed under you in the matrix" },
  { reason: "NONWORKING_U1", name: "Non-working U1", note: "From members you sponsored (non-working share)" },
  { reason: "NONWORKING_UPLINE", name: "Non-working upline", note: "From uplines 2–9 of the non-working share" },
  { reason: "REENTRY", name: "Re-entry income", note: "From completed pool re-entries" },
  { reason: "WEEKLY_SUPERSTAR", name: "Weekly Superstar", note: "Weekly reward for the top direct recruiter" },
  { reason: "POOL_LEVEL_INCOME", name: "Team income", note: "Single-Leg, Working and Non-Working pools moved to your balance" },
  { reason: "FIVE_STAR_ROYALTY", name: "Five-Star royalty", note: "Your share of the Five-Star club" },
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
