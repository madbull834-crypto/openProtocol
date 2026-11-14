import { describe, expect, it } from "vitest";
import { zeroAddress, type Address } from "viem";
import { buildTree, nextLevel, type ChildMap } from "./matrix-core";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const C = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const D = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

describe("matrix tree", () => {
  const children: ChildMap = new Map([[A, [B, C]], [B, [D, zeroAddress]]]);

  it("builds nested nodes and leaves empty slots as null", () => {
    const tree = buildTree(A, children, new Map([[A, 1n], [D, 4n]]), 3);
    expect(tree.id).toBe(1n);
    expect(tree.children[0]?.address).toBe(B);
    expect(tree.children[1]?.address).toBe(C);
    expect(tree.children[0]?.children[0]?.id).toBe(4n);
    expect(tree.children[0]?.children[1]).toBeNull();
    expect(tree.children[1]?.children).toEqual([null, null]);
  });

  it("stops at the requested depth", () => {
    expect(buildTree(A, children, new Map(), 0).children).toEqual([null, null]);
  });

  it("lists the next level in slot order, skipping empty slots", () => {
    expect(nextLevel([A], children)).toEqual([B, C]);
    expect(nextLevel([B, C], children)).toEqual([D]);
  });
});
