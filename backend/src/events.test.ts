import { describe, expect, it } from "vitest";
import { batchEnd, finalBlock } from "./events.js";

describe("indexing boundaries", () => {
  it("keeps a confirmation lag", () => expect(finalBlock(100n, 12n)).toBe(88n));
  it("does not underflow near genesis", () => expect(finalBlock(4n, 12n)).toBe(0n));
  it("caps batches at the finalized target", () => expect(batchEnd(100n, 120n, 1000n)).toBe(120n));
});
