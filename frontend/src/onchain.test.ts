import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { useSingleLegLine } from "./onchain";

const { client, useQuery } = vi.hoisted(() => ({
  client: { getBlockNumber: vi.fn(), readContract: vi.fn(), multicall: vi.fn() },
  useQuery: vi.fn<(options: { queryFn: (context: { signal: AbortSignal }) => Promise<unknown> }) => unknown>(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery }));
vi.mock("wagmi", () => ({ usePublicClient: () => client }));
vi.mock("./config", () => ({ chainId: 97, protocolAddress: "0x0000000000000000000000000000000000000010" }));

const member = (id: number) => `0x${id.toString(16).padStart(40, "0")}` as Address;
const owners = [member(1), member(2), member(3), member(4), member(2), member(6)];
const lineInfo = new Map([
  [member(1), [1n, 2, 0n, 0, 30n]],
  [member(2), [2n, 3, 5n, 2, 30n]],
  [member(3), [3n, 1, 0n, 0, 30n]],
  [member(4), [4n, 2, 0n, 0, 30n]],
  [member(6), [6n, 2, 0n, 0, 30n]],
]);

describe("Single-Leg progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getBlockNumber.mockResolvedValue(100n);
    client.readContract.mockImplementation(({ args: [account] }) => lineInfo.get(account));
    client.multicall.mockImplementation(({ blockNumber, contracts }) => {
      expect(blockNumber).toBe(100n);
      return contracts.map(({ functionName, args: [arg] }: { functionName: string; args: [number | bigint | Address] }) => {
        switch (functionName) {
          case "lineCursor": return arg === 2 ? 7n : 1n;
          case "singleLegReached": return arg === 2 ? 5n : 0n;
          case "lineOwnerAt": return owners[Number(arg) - 1];
          case "singleLegInfo": return lineInfo.get(arg as Address);
          default: throw new Error(`Unexpected read ${functionName}`);
        }
      });
    });
  });

  async function readProgress(id: number) {
    useSingleLegLine(member(id), 0);
    return useQuery.mock.calls[0][0].queryFn({ signal: new AbortController().signal });
  }

  it("shows partial Level 3 progress for the root while excluding its own Level 2 position", async () => {
    expect(await readProgress(1)).toMatchObject({ primaryLevel: 2, qualifiedLevel: 2, qualifiedAfter: 4 });
  });

  it("counts a qualified re-entry behind a member using the level of that position", async () => {
    expect(await readProgress(4)).toMatchObject({ primaryLevel: 2, qualifiedLevel: 2, qualifiedAfter: 2 });
  });

  it("uses the re-entry position and its own completed level to count progress", async () => {
    expect(await readProgress(2)).toMatchObject({
      primaryLevel: 3, team: 28, qualifiedAfter: 0,
      reentry: 5, reentryLevel: 2, reentryTeam: 25, reentryQualifiedAfter: 1,
    });
  });
});
