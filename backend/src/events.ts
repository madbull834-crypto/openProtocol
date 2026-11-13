import { parseAbiItem } from "viem";

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
