import { keccak256, parseAbiItem, toHex } from "viem";

export const participantRegistered = parseAbiItem(
  "event ParticipantRegistered(address indexed account, address indexed sponsor, uint64 indexed memberId, uint64 joinedAt)",
);
export const participationAllocated = parseAbiItem(
  "event ParticipationAllocated(address indexed account, uint256 workingAmount, uint256 nonWorkingAmount, uint256 clubAmount)",
);

export function finalBlock(head: bigint, confirmations: bigint) {
  return head > confirmations ? head - confirmations : 0n;
}

export function batchEnd(from: bigint, target: bigint, batchSize: bigint) {
  const candidate = from + batchSize - 1n;
  return candidate < target ? candidate : target;
}

export const rewardCredited = parseAbiItem(
  "event RewardCredited(address indexed account, uint256 amount, bytes32 indexed reason)",
);
export const poolIncomeQueued = parseAbiItem(
  "event PoolIncomeQueued(address indexed account, uint8 indexed pool, uint8 level, uint256 amount)",
);
export const claimed = parseAbiItem(
  "event Claimed(address indexed account, uint256 gross, uint256 net, uint256 royalty, uint256 development)",
);

/** Every reason code the protocol passes to `_credit`. Stored by name so the API stays readable. */
export const REWARD_REASONS = [
  "DIRECT_INCOME",
  "TEN_LEVEL_UPLINE",
  "MATRIX_INCOME",
  "NONWORKING_U1",
  "NONWORKING_UPLINE",
  "REENTRY",
  "WEEKLY_SUPERSTAR",
  "SINGLE_LEG_INCOME",
  "WORKING_LEVEL_INCOME",
  "NON_WORKING_MATRIX_INCOME",
  "FIVE_STAR_ROYALTY",
  "STAR_CLUB_ROYALTY",
] as const;
export type RewardReason = (typeof REWARD_REASONS)[number];

const reasonByHash = new Map<string, RewardReason>(REWARD_REASONS.map((name) => [keccak256(toHex(name)), name]));

/** Maps the indexed bytes32 reason back to its name; unknown hashes are kept verbatim. */
export function decodeReason(hash: `0x${string}`): string {
  return reasonByHash.get(hash.toLowerCase()) ?? hash.toLowerCase();
}
