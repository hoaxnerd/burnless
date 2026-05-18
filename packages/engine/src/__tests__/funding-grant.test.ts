import { describe, it, expect } from "vitest";
import { computeGrant } from "../funding";

describe("computeGrant", () => {
  it("disburses on the month each milestone's hitDate falls in", () => {
    const result = computeGrant({
      roundId: "g1",
      roundName: "SBIR Phase II",
      params: {
        milestones: [
          { id: "m1", label: "Kickoff", amount: 50_000, dueDate: "2026-03-01", hitDate: "2026-03-15" },
          { id: "m2", label: "MVP", amount: 100_000, dueDate: "2026-06-01", hitDate: "2026-07-10" },
          { id: "m3", label: "Pilot", amount: 150_000, dueDate: "2026-09-01" },
        ],
      },
      cumulativeQualifyingSpend: { "2026-12": 0 },
    });
    expect(result.disbursements.get("2026-03")).toBe(50_000);
    expect(result.disbursements.get("2026-07")).toBe(100_000);
    expect(result.disbursements.get("2026-09") ?? 0).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("emits warning when matchRequirement is unmet at asOf date", () => {
    const result = computeGrant({
      roundId: "g1",
      roundName: "R&D Grant",
      params: {
        milestones: [{ id: "m1", label: "Q1 progress", amount: 100_000, dueDate: "2026-04-01", hitDate: "2026-04-01" }],
        matchRequirement: { requiredAmount: 200_000, asOf: "2026-04-01" },
      },
      cumulativeQualifyingSpend: { "2026-04": 150_000 },
    });
    expect(result.warnings).toEqual([
      { roundId: "g1", roundName: "R&D Grant", milestoneId: "m1", milestoneLabel: "Q1 progress", requiredAmount: 200_000, actualAmount: 150_000, asOf: "2026-04-01" },
    ]);
    expect(result.disbursements.get("2026-04")).toBe(100_000);
  });

  it("does not warn when match is met", () => {
    const result = computeGrant({
      roundId: "g1",
      roundName: "R&D Grant",
      params: {
        milestones: [{ id: "m1", label: "Q1", amount: 100_000, dueDate: "2026-04-01", hitDate: "2026-04-01" }],
        matchRequirement: { requiredAmount: 200_000, asOf: "2026-04-01" },
      },
      cumulativeQualifyingSpend: { "2026-04": 250_000 },
    });
    expect(result.warnings).toEqual([]);
  });
});
