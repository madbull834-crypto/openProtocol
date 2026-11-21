import { describe, expect, it } from "vitest";
import { incomeName, incomeStreams } from "./income";

describe("income labels", () => {
  it("exposes the on-chain Five-Star reward as Royalty Club income", () => {
    expect(incomeName("FIVE_STAR_ROYALTY")).toBe("Royalty Club income");
    expect(incomeStreams.find((stream) => stream.reason === "FIVE_STAR_ROYALTY")?.note)
      .toContain("17% withdrawal royalty");
  });
});
