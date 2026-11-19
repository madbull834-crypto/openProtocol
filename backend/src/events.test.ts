import { describe, expect, it } from "vitest";
import { keccak256, toHex } from "viem";
import { batchEnd, decodeReason, finalBlock, REWARD_REASONS } from "./events.js";

describe("indexing boundaries", () => {
  it("keeps a confirmation lag", () => expect(finalBlock(100n, 12n)).toBe(88n));
  it("does not underflow near genesis", () => expect(finalBlock(4n, 12n)).toBe(0n));
  it("caps batches at the finalized target", () => expect(batchEnd(100n, 120n, 1000n)).toBe(120n));
});

describe("reward reasons", () => {
  it("decodes every protocol reason hash", () => {
    for (const name of REWARD_REASONS) expect(decodeReason(keccak256(toHex(name)))).toBe(name);
  });
  it("keeps unknown hashes verbatim", () => expect(decodeReason(`0x${"ab".repeat(32)}`)).toBe(`0x${"ab".repeat(32)}`));
});
