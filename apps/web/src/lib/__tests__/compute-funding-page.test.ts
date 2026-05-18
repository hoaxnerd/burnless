import { describe, it, expect } from "vitest";
import { enrichGrantMilestonesWithWarnings } from "../compute-funding-page";

describe("enrichGrantMilestonesWithWarnings", () => {
  it("attaches matchWarning to the milestone the warning was raised for", () => {
    const rounds = [
      {
        id: "g1", name: "R&D Grant", type: "grant",
        parameters: {
          milestones: [
            { id: "m1", label: "Q1", amount: 100_000, dueDate: "2026-04-01", hitDate: "2026-04-01" },
            { id: "m2", label: "Q2", amount: 100_000, dueDate: "2026-07-01" },
          ],
        },
      },
    ];
    const warnings = [
      {
        roundId: "g1", roundName: "R&D Grant", milestoneId: "m1", milestoneLabel: "Q1",
        requiredAmount: 200_000, actualAmount: 50_000, asOf: "2026-04-01",
      },
    ];
    const enriched = enrichGrantMilestonesWithWarnings(rounds as any, warnings);
    const grant = enriched.find((r) => r.id === "g1")!;
    const milestones = (grant.parameters as any).milestones;
    const m1 = milestones.find((m: any) => m.id === "m1");
    const m2 = milestones.find((m: any) => m.id === "m2");
    expect(m1.matchWarning).toEqual({ requiredAmount: 200_000, actualAmount: 50_000, asOf: "2026-04-01" });
    expect(m2.matchWarning).toBeUndefined();
  });

  it("leaves non-grant rounds untouched", () => {
    const rounds = [{ id: "r1", name: "Seed", type: "seed", parameters: {} }];
    const enriched = enrichGrantMilestonesWithWarnings(rounds as any, []);
    expect(enriched).toEqual(rounds);
  });
});
