import { describe, expect, it } from "vitest";
import { formatToken, shortAddress } from "./format";

describe("format utilities", () => {
  it("formats six-decimal USDT without float precision", () => {
    expect(formatToken(25_000_000n)).toBe("25");
    expect(formatToken(25_120_000n)).toBe("25.12");
  });
  it("shortens addresses", () => expect(shortAddress("0x1234567890abcdef")).toBe("0x1234…cdef"));
});
