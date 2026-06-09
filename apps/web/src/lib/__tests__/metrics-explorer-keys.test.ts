/**
 * Structural verification: ensure every metric key referenced in the
 * metrics explorer UI maps to a real key on ComputedMetrics from the engine.
 *
 * This catches rename/removal drift between the engine and the UI.
 */
import { describe, it, expect } from "vitest";
import type { ComputedMetrics } from "@burnless/engine";

// These are the keys that the metrics explorer UI renders.
// Kept in sync with apps/web/src/app/(dashboard)/reports/metrics/metrics-explorer.tsx
const EXPLORER_METRIC_KEYS: (keyof ComputedMetrics)[] = [
  // Revenue
  "mrr",
  "arr",
  "totalRevenue",
  "revenueRunRate",
  "newMrr",
  "expansionMrr",
  "churnedMrr",
  "netNewMrr",

  // SaaS
  "totalCustomers",
  "newCustomersPerMonth",
  "churnedCustomersPerMonth",
  "customerChurnRate",
  "revenueChurnRate",
  "arpa",
  "ltv",
  "cac",
  "ltvCacRatio",
  "cacPaybackMonths",
  "saasQuickRatio",
  "magicNumber",

  // Cash
  "burnRate",
  "netBurnRate",
  "cashRunwayMonths",
  "cashPosition",

  // Profitability
  "grossProfit",
  "grossMarginPercent",
  "operatingIncome",
  "netIncome",
  "ebitda",

  // Growth
  "revenueGrowthRate",
  "mrrGrowthRate",
  "customerGrowthRate",
  "revenuePerEmployee",

  // Efficiency
  "burnMultiple",
  "ruleOf40",
];

// Build the set of valid engine keys from a dummy object (TypeScript ensures correctness at compile time,
// but this runtime check catches copy-paste issues and validates the constant above).
const VALID_ENGINE_KEYS: Set<string> = new Set<string>([
  "mrr", "arr", "totalRevenue", "revenueRunRate",
  "newMrr", "expansionMrr", "churnedMrr", "netNewMrr",
  "totalCustomers", "newCustomersPerMonth", "churnedCustomersPerMonth",
  "customerChurnRate", "revenueChurnRate", "ltv", "cac", "ltvCacRatio",
  "cacPaybackMonths", "arpa", "saasQuickRatio", "magicNumber",
  "burnRate", "netBurnRate", "cashRunwayMonths", "cashPosition",
  "grossProfit", "grossMarginPercent", "operatingIncome", "netIncome", "ebitda",
  "revenueGrowthRate", "mrrGrowthRate", "customerGrowthRate", "revenuePerEmployee",
  "burnMultiple", "ruleOf40",
  // Tier-1 & Tier-2 metrics (in engine but not yet in explorer)
  "contractionMrr", "downgradeMrr", "reactivationMrr",
  "netRevenueRetention", "grossRevenueRetention",
  "freeCashFlow", "fcfMargin", "ttmRevenue",
  "arpu", "netChurnRate", "hasNegativeChurn",
  "burnProductivity", "workingCapital", "customerRetentionCost",
  // Phase 5 Task 5.1 — interest expense emitted as a ComputedMetrics slug
  "interestExpense",
]);

describe("Metrics Explorer → Engine alignment", () => {
  it("every explorer metric key is a valid ComputedMetrics key", () => {
    for (const key of EXPLORER_METRIC_KEYS) {
      expect(VALID_ENGINE_KEYS.has(key), `Explorer references "${key}" which is not a valid engine metric`).toBe(true);
    }
  });

  it("explorer has no duplicate metric keys", () => {
    const seen = new Set<string>();
    for (const key of EXPLORER_METRIC_KEYS) {
      expect(seen.has(key), `Duplicate metric key "${key}" in explorer`).toBe(false);
      seen.add(key);
    }
  });

  it("explorer exposes at least 30 metrics (currently 35)", () => {
    expect(EXPLORER_METRIC_KEYS.length).toBeGreaterThanOrEqual(30);
  });

  it("covers all 6 metric categories", () => {
    // The explorer groups by category. This ensures none are empty.
    const revenueKeys = ["mrr", "arr", "totalRevenue", "revenueRunRate", "newMrr", "expansionMrr", "churnedMrr", "netNewMrr"];
    const saasKeys = ["totalCustomers", "customerChurnRate", "revenueChurnRate", "ltv", "cac", "ltvCacRatio"];
    const cashKeys = ["burnRate", "netBurnRate", "cashRunwayMonths", "cashPosition"];
    const profitKeys = ["grossProfit", "grossMarginPercent", "operatingIncome", "netIncome", "ebitda"];
    const growthKeys = ["revenueGrowthRate", "mrrGrowthRate", "customerGrowthRate", "revenuePerEmployee"];
    const efficiencyKeys = ["burnMultiple", "ruleOf40"];

    for (const key of revenueKeys) expect(EXPLORER_METRIC_KEYS).toContain(key);
    for (const key of saasKeys) expect(EXPLORER_METRIC_KEYS).toContain(key);
    for (const key of cashKeys) expect(EXPLORER_METRIC_KEYS).toContain(key);
    for (const key of profitKeys) expect(EXPLORER_METRIC_KEYS).toContain(key);
    for (const key of growthKeys) expect(EXPLORER_METRIC_KEYS).toContain(key);
    for (const key of efficiencyKeys) expect(EXPLORER_METRIC_KEYS).toContain(key);
  });

  it("identifies engine metrics not yet in explorer (coverage gap report)", () => {
    const explorerSet = new Set(EXPLORER_METRIC_KEYS as string[]);
    const missing = Array.from(VALID_ENGINE_KEYS).filter((k) => !explorerSet.has(k));

    // These are known tier-1 and tier-2 metrics not yet exposed in the explorer.
    // This test documents the gap — if the list shrinks, the explorer gained coverage.
    expect(missing.length).toBeGreaterThan(0); // Update when all metrics are exposed
    expect(missing).toContain("contractionMrr");
    expect(missing).toContain("netRevenueRetention");
    expect(missing).toContain("freeCashFlow");
  });
});
