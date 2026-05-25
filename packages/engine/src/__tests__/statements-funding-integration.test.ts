import { describe, it, expect } from "vitest";
import { generateCashFlow } from "../statements";
import { computeFundingImpact } from "../funding";
import { monthRange } from "../utils";

describe("generateCashFlow integrates funding impact", () => {
  const months = monthRange("2026-01-01", "2026-12-31").map(
    (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  );

  it("splits financing CF into equityInflows + debtInflows children", () => {
    const impact = computeFundingImpact({
      rounds: [
        { id: "r1", name: "Seed", roundType: "seed", amount: 1_000_000, date: "2026-01-01", parameters: {} as any },
        {
          id: "d1",
          name: "Bridge",
          roundType: "debt",
          amount: 240_000,
          date: "2026-01-01",
          parameters: { interestRate: 0.12, termMonths: 12, repaymentSchedule: "straight_line" } as any,
        },
      ],
      months,
      cumulativeQualifyingSpend: {},
    });
    const cf = generateCashFlow([], 0, undefined, impact);
    expect(cf.financingCashFlow.children?.map((c) => c.name)).toEqual([
      "Equity Inflows",
      "Debt Inflows",
      "Principal Payments",
    ]);
    const equity = cf.financingCashFlow.children!.find((c) => c.name === "Equity Inflows");
    expect(equity!.values.find((v) => v.month === "2026-01")?.value).toBe(1_000_000);
    const debt = cf.financingCashFlow.children!.find((c) => c.name === "Debt Inflows");
    expect(debt!.values.find((v) => v.month === "2026-01")?.value).toBe(240_000);
    const principal = cf.financingCashFlow.children!.find((c) => c.name === "Principal Payments");
    expect(principal!.values.find((v) => v.month === "2026-01")?.value).toBe(-20_000);
  });
});
