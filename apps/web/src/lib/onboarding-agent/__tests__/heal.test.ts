import { describe, it, expect } from "vitest";
import { cleanNumber, cleanDate, healOnboardingResult } from "../heal";

describe("cleanNumber", () => {
  it("returns the value unchanged for finite numbers", () => {
    expect(cleanNumber(1500000)).toBe(1500000);
  });

  it("parses K/M/B suffixes", () => {
    expect(cleanNumber("1.5M")).toBe(1_500_000);
    expect(cleanNumber("$30K")).toBe(30_000);
    expect(cleanNumber("2.5B")).toBe(2_500_000_000);
  });

  it("strips currency formatting", () => {
    expect(cleanNumber("$1,500,000")).toBe(1_500_000);
  });

  it("returns 0 for null/undefined/garbage input", () => {
    expect(cleanNumber(null)).toBe(0);
    expect(cleanNumber(undefined)).toBe(0);
    expect(cleanNumber("not a number")).toBe(0);
    expect(cleanNumber({})).toBe(0);
  });
});

describe("cleanDate", () => {
  it("passes ISO YYYY-MM-DD through unchanged", () => {
    expect(cleanDate("2024-05-15")).toBe("2024-05-15");
  });

  it("expands bare-year to January 1st", () => {
    expect(cleanDate("2024")).toBe("2024-01-01");
  });

  it("extracts month and year from natural-language", () => {
    expect(cleanDate("May 2024")).toBe("2024-05-01");
    expect(cleanDate("December, 2023")).toBe("2023-12-01");
  });

  it("falls back to default year when nothing parseable", () => {
    expect(cleanDate(null)).toBe("2026-01-01");
    expect(cleanDate("", "2025")).toBe("2025-01-01");
  });
});

describe("healOnboardingResult — funding rounds notes (operator-precedence regression)", () => {
  // Guards against the bug fixed alongside this module restructure: the old
  // `r.notes || r.valuation ? \`Valuation: ${r.valuation}\` : ""` expression
  // dropped any user-supplied notes whenever a valuation was *also* present,
  // and wrote the literal "Valuation: undefined" when notes existed but
  // valuation didn't. Both cases are pinned here.

  it("prefers explicit notes over the valuation fallback", () => {
    const result = healOnboardingResult({
      companyName: "Acme",
      fundingRounds: [
        { name: "Seed Round", amount: 1_000_000, date: "2024", notes: "Led by Sequoia", valuation: 5_000_000 },
      ],
    });
    expect(result.fundingRounds[0]?.notes).toBe("Led by Sequoia");
  });

  it("uses the valuation fallback only when notes are absent", () => {
    const result = healOnboardingResult({
      companyName: "Acme",
      fundingRounds: [
        { name: "Seed Round", amount: 1_000_000, date: "2024", valuation: 5_000_000 },
      ],
    });
    expect(result.fundingRounds[0]?.notes).toBe("Valuation: 5000000");
  });

  it("never produces a literal 'undefined' in notes when valuation is missing", () => {
    const result = healOnboardingResult({
      companyName: "Acme",
      fundingRounds: [
        { name: "Seed Round", amount: 1_000_000, date: "2024" },
      ],
    });
    expect(result.fundingRounds[0]?.notes).not.toContain("undefined");
    expect(result.fundingRounds[0]?.notes).toBe("");
  });
});

describe("healOnboardingResult — enum mapping", () => {
  it("normalizes stage strings (case + format variants)", () => {
    expect(healOnboardingResult({ stage: "Pre-Seed" }).stage).toBe("Pre-seed");
    expect(healOnboardingResult({ stage: "series_b" }).stage).toBe("Series B+");
    expect(healOnboardingResult({ stage: "Series D" }).stage).toBe("Series B+");
    expect(healOnboardingResult({ stage: "bootstrapped" }).stage).toBe("Bootstrapped");
  });

  it("maps funding round names to type enum", () => {
    const result = healOnboardingResult({
      companyName: "Acme",
      fundingRounds: [
        { name: "Pre-Seed Round", amount: 100 },
        { name: "Series C+", amount: 100 },
        { name: "Debt facility", amount: 100 },
        { name: "EU Horizon grant", amount: 100 },
      ],
    });
    expect(result.fundingRounds.map((r) => r.type)).toEqual([
      "pre_seed",
      "series_c_plus",
      "debt",
      "grant",
    ]);
  });

  it("treats founders as either array or comma-separated string", () => {
    expect(healOnboardingResult({ founders: "Alice, Bob and Carol" }).founders).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
    expect(
      healOnboardingResult({ founders: [{ name: "Dee" }, "Eve"] }).founders,
    ).toEqual(["Dee", "Eve"]);
  });
});

describe("healOnboardingResult — fallbacks", () => {
  // Removed (Phase 4 E Task 1): "returns minimal fallback headcount when
  // nothing supplied" and "returns a richer stage plan when headcount is a
  // numeric size" — these locked in the silently-lying fallback behavior.
  // heal now returns [] on empty/absent input (same fix as 5f7f7da for
  // revenue streams). Covered by heal-no-fallbacks.test.ts.

  it("derives a single subscription stream from estimated annual revenue", () => {
    const result = healOnboardingResult({ annual_revenue: "12M" });
    expect(result.revenueStreams).toHaveLength(1);
    expect(result.revenueStreams[0]?.type).toBe("subscription");
    expect(result.revenueStreams[0]?.notes).toContain("$12.0M");
  });
});
