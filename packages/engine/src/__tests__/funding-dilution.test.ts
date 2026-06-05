import { describe, it, expect } from "vitest";
import { computeDilution } from "../funding";

describe("computeDilution — interactive raise modeling", () => {
  it("matches the canonical $2M @ $8M pre example (founders 95% -> 76%)", () => {
    const r = computeDilution({
      raiseAmount: 2_000_000,
      preMoney: 8_000_000,
      foundersOwnershipPct: 95,
    });
    expect(r.postMoney).toBe(10_000_000);
    expect(r.dilutionPct).toBe(20);
    expect(r.newFoundersOwnershipPct).toBe(76);
  });

  it("returns no dilution when post-money is non-positive", () => {
    const r = computeDilution({ raiseAmount: 0, preMoney: 0, foundersOwnershipPct: 95 });
    expect(r.dilutionPct).toBe(0);
    expect(r.postMoney).toBe(0);
    expect(r.newFoundersOwnershipPct).toBe(95);
  });

  it("is precise for awkward valuations", () => {
    const r = computeDilution({
      raiseAmount: 1_500_000,
      preMoney: 6_000_000,
      foundersOwnershipPct: 100,
    });
    expect(r.postMoney).toBe(7_500_000);
    expect(r.dilutionPct).toBe(20);
    expect(r.newFoundersOwnershipPct).toBe(80);
  });
});
