import { describe, expect, it } from "vitest";
import { incomeName, incomeStreams } from "./income";

describe("income labels", () => {
  it("labels both star-club royalty streams", () => {
    expect(incomeName("FIVE_STAR_ROYALTY")).toBe("5 Star Club royalty");
    expect(incomeName("STAR_CLUB_ROYALTY")).toBe("Star Club royalty");
    expect(incomeStreams.find((stream) => stream.reason === "STAR_CLUB_ROYALTY")?.note)
      .toContain("3% of every withdrawal");
    expect(incomeName("SINGLE_LEG_INCOME")).toBe("Single-Leg income");
  });
});
