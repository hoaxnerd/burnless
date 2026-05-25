import { describe, it, expect } from "vitest";
import { healOnboardingResult } from "../heal";

describe("heal.ts no-silent-fallbacks (Phase 4 E Task 1)", () => {
  it("returns empty headcount when the agent provides none", () => {
    const result = healOnboardingResult({
      companyName: "Test Co",
      stage: "Pre-seed",
      businessModel: "SaaS",
      headcount: [],
    } as never);
    expect(result.headcount).toEqual([]);
  });

  it("returns empty expenses when the agent provides none", () => {
    const result = healOnboardingResult({
      companyName: "Test Co",
      expenses: [],
    } as never);
    expect(result.expenses).toEqual([]);
  });

  it("returns empty revenueStreams when the agent provides none", () => {
    const result = healOnboardingResult({
      companyName: "Test Co",
      revenueStreams: [],
    } as never);
    expect(result.revenueStreams).toEqual([]);
  });

  it("preserves real headcount when the agent provides any", () => {
    const result = healOnboardingResult({
      companyName: "Test Co",
      headcount: [
        { title: "Founder", department: "Engineering", employeeType: "full_time", salary: 0 },
      ],
    } as never);
    expect(result.headcount.length).toBe(1);
    expect(result.headcount[0]?.title).toBe("Founder");
  });
});
