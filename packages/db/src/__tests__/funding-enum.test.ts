import { describe, it, expect } from "vitest";
import { fundingRoundTypeEnum } from "../schema";

describe("fundingRoundTypeEnum", () => {
  it("includes safe and convertible alongside existing types", () => {
    expect(fundingRoundTypeEnum.enumValues).toEqual([
      "pre_seed",
      "seed",
      "series_a",
      "series_b",
      "series_c_plus",
      "debt",
      "grant",
      "safe",
      "convertible",
    ]);
  });
});
