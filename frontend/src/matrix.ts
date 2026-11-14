import { useMemo } from "react";
import { type Address } from "viem";
import { useReadContracts } from "wagmi";
import { protocolAddress } from "./config";
import { protocolAbi } from "./contracts/abi";
import { buildTree, nextLevel, type ChildMap } from "./matrix-core";

export type { MatrixNode } from "./matrix-core";

const key = (a: Address) => a.toLowerCase();

function useChildren(nodes: Address[]) {
  const read = useReadContracts({
    allowFailure: true,
    contracts: nodes.map((a) => ({ address: protocolAddress!, abi: protocolAbi, functionName: "getMatrixChildren" as const, args: [a] as const })),
    query: { enabled: Boolean(protocolAddress) && nodes.length > 0, refetchInterval: 12_000, retry: 2 },
  });
  const map = useMemo(() => {
    const m: ChildMap = new Map();
    nodes.forEach((a, i) => { const r = read.data?.[i]?.result as readonly [Address, Address] | undefined; if (r) m.set(key(a), r); });
    return m;
  }, [nodes, read.data]);
  const failed = read.data?.filter((result) => result.status === "failure").length ?? 0;
  return { map, loading: read.isLoading, failed };
}

/** Reads three levels of matrix downline beneath `root`, plus member ids for every discovered node. */
export function useMatrixTree(root?: Address) {
  const level0 = useMemo(() => (root ? [root] : []), [root]);
  const l0 = useChildren(level0);
  const level1 = useMemo(() => nextLevel(level0, l0.map), [level0, l0.map]);
  const l1 = useChildren(level1);
  const level2 = useMemo(() => nextLevel(level1, l1.map), [level1, l1.map]);
  const l2 = useChildren(level2);
  const level3 = useMemo(() => nextLevel(level2, l2.map), [level2, l2.map]);

  const all = useMemo(() => [...level0, ...level1, ...level2, ...level3], [level0, level1, level2, level3]);
  const idsRead = useReadContracts({
    allowFailure: true,
    contracts: all.map((a) => ({ address: protocolAddress!, abi: protocolAbi, functionName: "getParticipant" as const, args: [a] as const })),
    query: { enabled: Boolean(protocolAddress) && all.length > 0, refetchInterval: 12_000, retry: 2 },
  });

  return useMemo(() => {
    if (!root) return { tree: undefined, loading: false, filled: 0, failed: 0 };
    const children: ChildMap = new Map([...l0.map, ...l1.map, ...l2.map]);
    const ids = new Map<string, bigint>();
    all.forEach((a, i) => { const r = idsRead.data?.[i]?.result as { id: bigint } | undefined; if (r && r.id > 0n) ids.set(key(a), r.id); });
    const idFailures = idsRead.data?.filter((result) => result.status === "failure").length ?? 0;
    return {
      tree: buildTree(root, children, ids, 3),
      loading: l0.loading || l1.loading || l2.loading,
      filled: level1.length + level2.length + level3.length,
      failed: l0.failed + l1.failed + l2.failed + idFailures,
    };
  }, [root, l0, l1, l2, all, idsRead.data, level1.length, level2.length, level3.length]);
}
