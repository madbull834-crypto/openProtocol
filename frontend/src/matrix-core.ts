import { zeroAddress, type Address } from "viem";

export type MatrixNode = { address: Address; id?: bigint; children: [MatrixNode | null, MatrixNode | null] };
export type ChildMap = Map<string, readonly [Address, Address]>;

const key = (address: Address) => address.toLowerCase();

/** Builds a binary tree of `depth` levels below `root` from a map of account -> two child slots. */
export function buildTree(root: Address, children: ChildMap, ids: Map<string, bigint>, depth: number): MatrixNode {
  const node: MatrixNode = { address: root, id: ids.get(key(root)), children: [null, null] };
  if (depth === 0) return node;
  const slots = children.get(key(root)) ?? [zeroAddress, zeroAddress];
  node.children = [0, 1].map((index) =>
    slots[index] && slots[index] !== zeroAddress
      ? buildTree(slots[index], children, ids, depth - 1)
      : null,
  ) as MatrixNode["children"];
  return node;
}

/** Non-empty child addresses of every account in `nodes`, in order. */
export function nextLevel(nodes: Address[], children: ChildMap): Address[] {
  return nodes.flatMap((address) =>
    (children.get(key(address)) ?? []).filter((child) => child !== zeroAddress),
  );
}
