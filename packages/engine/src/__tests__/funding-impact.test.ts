import { describe, it, expect } from "vitest";
import { computeFundingImpact } from "../funding";
import { monthRange } from "../utils";

describe("computeFundingImpact", () => {
  const months = monthRange("2026-01-01", "2026-12-31").map(
    (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  );

  it("routes priced rounds to equityInflows on closeDate month", () => {
    const result = computeFundingImpact({
      rounds: [
        {
          id: "r1",
          name: "Seed",
          roundType: "seed",
          amount: 1_500_000,
          date: "2026-02-01",
          closeDate: "2026-03-15",
          parameters: { pricePerShare: 0.5 },
        },
      ],
      months,
      cumulativeQualifyingSpend: {},
    });
    expect(result.equityInflows.get("2026-03")).toBe(1_500_000);
    expect(result.debtInflows.get("2026-03") ?? 0).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("routes debt draws to debtInflows + emits interestExpense + principalPayments", () => {
    const result = computeFundingImpact({
      rounds: [
        {
          id: "d1",
          name: "Bridge",
          roundType: "debt",
          amount: 120_000,
          date: "2026-01-01",
          parameters: { interestRate: 0.12, termMonths: 12, repaymentSchedule: "straight_line" },
        },
      ],
      months,
      cumulativeQualifyingSpend: {},
    });
    expect(result.debtInflows.get("2026-01")).toBe(120_000);
    expect(result.interestExpense.get("2026-01")).toBe(1_200);
    expect(result.principalPayments.get("2026-01")).toBe(10_000);
  });

  it("routes grant milestones to grantDisbursements + surfaces match warnings", () => {
    const result = computeFundingImpact({
      rounds: [
        {
          id: "g1",
          name: "R&D Grant",
          roundType: "grant",
          amount: 200_000,
          date: "2026-01-01",
          parameters: {
            milestones: [
              { id: "m1", label: "Q1", amount: 100_000, dueDate: "2026-04-01", hitDate: "2026-04-01" },
            ],
            matchRequirement: { requiredAmount: 50_000, asOf: "2026-04-01" },
          },
        },
      ],
      months,
      cumulativeQualifyingSpend: { "2026-04": 30_000 },
    });
    expect(result.grantDisbursements.get("2026-04")).toBe(100_000);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].milestoneId).toBe("m1");
  });
});
