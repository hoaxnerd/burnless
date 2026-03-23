import { describe, it, expect } from "vitest";
import { compareScenarios, type ScenarioData } from "../scenarios";
import type { MonthlySeries } from "../utils";

/**
 * Scenario isolation unit tests — BUR-271
 *
 * Verifies that compareScenarios and related engine functions:
 * 1. Never mutate input ScenarioData objects
 * 2. Keep base and compare data strictly separated
 * 3. Handle edge cases without cross-contamination
 */

function makeScenario(
  id: string,
  name: string,
  overrides: Partial<ScenarioData["aggregates"]> = {},
  accounts: Map<string, MonthlySeries> = new Map()
): ScenarioData {
  const defaults: ScenarioData["aggregates"] = {
    revenue: new Map([["2026-01", 50000], ["2026-02", 55000]]),
    expenses: new Map([["2026-01", 30000], ["2026-02", 32000]]),
    netIncome: new Map([["2026-01", 20000], ["2026-02", 23000]]),
    cashPosition: new Map([["2026-01", 100000], ["2026-02", 123000]]),
    headcount: new Map([["2026-01", 10], ["2026-02", 12]]),
  };
  return {
    id,
    name,
    accounts,
    aggregates: { ...defaults, ...overrides },
  };
}

/** Deep-clone a ScenarioData for snapshot comparison */
function snapshotScenario(s: ScenarioData): {
  id: string;
  name: string;
  accounts: [string, [string, number][]][];
  aggregates: Record<string, [string, number][]>;
} {
  const accounts = Array.from(s.accounts.entries()).map(
    ([k, v]) => [k, Array.from(v.entries())] as [string, [string, number][]]
  );
  const aggregates: Record<string, [string, number][]> = {};
  for (const [key, series] of Object.entries(s.aggregates)) {
    aggregates[key] = Array.from((series as MonthlySeries).entries());
  }
  return { id: s.id, name: s.name, accounts, aggregates };
}

describe("scenario isolation — engine purity", () => {
  it("compareScenarios does not mutate the base ScenarioData", () => {
    const base = makeScenario("base", "Base Case", {
      revenue: new Map([["2026-01", 50000], ["2026-02", 55000]]),
    });
    const compare = makeScenario("compare", "Best Case", {
      revenue: new Map([["2026-01", 70000], ["2026-02", 80000]]),
    });

    const baseBefore = snapshotScenario(base);

    compareScenarios(base, compare);

    const baseAfter = snapshotScenario(base);
    expect(baseAfter).toEqual(baseBefore);
  });

  it("compareScenarios does not mutate the compare ScenarioData", () => {
    const base = makeScenario("base", "Base Case");
    const compare = makeScenario("compare", "Best Case", {
      revenue: new Map([["2026-01", 70000]]),
      expenses: new Map([["2026-01", 45000]]),
    });

    const compareBefore = snapshotScenario(compare);

    compareScenarios(base, compare);

    const compareAfter = snapshotScenario(compare);
    expect(compareAfter).toEqual(compareBefore);
  });

  it("comparing the same scenario to itself produces zero deltas", () => {
    const scenario = makeScenario("s1", "Same", {
      revenue: new Map([["2026-01", 100000], ["2026-02", 110000]]),
    });

    const result = compareScenarios(scenario, scenario);

    for (const entry of result.revenue.deltaAbsolute) {
      expect(entry.value, `Revenue delta for ${entry.month} should be 0`).toBe(0);
    }
    for (const entry of result.expenses.deltaAbsolute) {
      expect(entry.value, `Expenses delta for ${entry.month} should be 0`).toBe(0);
    }
    for (const entry of result.netIncome.deltaAbsolute) {
      expect(entry.value, `Net income delta for ${entry.month} should be 0`).toBe(0);
    }
    for (const entry of result.cashPosition.deltaAbsolute) {
      expect(entry.value, `Cash position delta for ${entry.month} should be 0`).toBe(0);
    }
    for (const entry of result.headcount.deltaAbsolute) {
      expect(entry.value, `Headcount delta for ${entry.month} should be 0`).toBe(0);
    }
  });

  it("result contains correct scenario name labels, not mixed", () => {
    const base = makeScenario("b", "Base Scenario");
    const compare = makeScenario("c", "Optimistic Scenario");

    const result = compareScenarios(base, compare);

    expect(result.baseScenario).toBe("Base Scenario");
    expect(result.compareScenario).toBe("Optimistic Scenario");
    // Ensure they're not swapped
    expect(result.baseScenario).not.toBe("Optimistic Scenario");
    expect(result.compareScenario).not.toBe("Base Scenario");
  });

  it("base values in comparison line come from base, compare values from compare", () => {
    const base = makeScenario("b", "Base", {
      revenue: new Map([["2026-01", 10000]]),
    });
    const compare = makeScenario("c", "Compare", {
      revenue: new Map([["2026-01", 25000]]),
    });

    const result = compareScenarios(base, compare);

    expect(result.revenue.baseValues[0]?.value).toBe(10000);
    expect(result.revenue.compareValues[0]?.value).toBe(25000);
    // Not swapped
    expect(result.revenue.baseValues[0]?.value).not.toBe(25000);
    expect(result.revenue.compareValues[0]?.value).not.toBe(10000);
  });

  it("account-level comparisons stay isolated per account", () => {
    const baseAccounts = new Map<string, MonthlySeries>();
    baseAccounts.set("marketing", new Map([["2026-01", 5000]]));
    baseAccounts.set("engineering", new Map([["2026-01", 20000]]));

    const compareAccounts = new Map<string, MonthlySeries>();
    compareAccounts.set("marketing", new Map([["2026-01", 8000]]));
    compareAccounts.set("engineering", new Map([["2026-01", 25000]]));

    const base = makeScenario("b", "Base", {}, baseAccounts);
    const compare = makeScenario("c", "Compare", {}, compareAccounts);

    const result = compareScenarios(base, compare);

    // Marketing: 8000 - 5000 = 3000
    const marketing = result.accountComparisons.get("marketing");
    expect(marketing?.deltaAbsolute[0]?.value).toBe(3000);
    expect(marketing?.baseValues[0]?.value).toBe(5000);
    expect(marketing?.compareValues[0]?.value).toBe(8000);

    // Engineering: 25000 - 20000 = 5000
    const engineering = result.accountComparisons.get("engineering");
    expect(engineering?.deltaAbsolute[0]?.value).toBe(5000);
    expect(engineering?.baseValues[0]?.value).toBe(20000);
    expect(engineering?.compareValues[0]?.value).toBe(25000);

    // Marketing delta should NOT contain engineering values
    expect(marketing?.deltaAbsolute[0]?.value).not.toBe(5000);
  });

  it("scenario with empty data does not affect populated scenario in comparison", () => {
    const populated = makeScenario("pop", "Populated", {
      revenue: new Map([["2026-01", 100000]]),
      expenses: new Map([["2026-01", 60000]]),
    });
    const empty = makeScenario("emp", "Empty", {
      revenue: new Map(),
      expenses: new Map(),
      netIncome: new Map(),
      cashPosition: new Map(),
      headcount: new Map(),
    });

    // Compare populated vs empty
    const result = compareScenarios(populated, empty);

    // Base values should be from populated scenario
    expect(result.revenue.baseValues[0]?.value).toBe(100000);
    // Compare values should be 0 (empty scenario defaults to 0 for missing months)
    expect(result.revenue.compareValues[0]?.value).toBe(0);
    // Delta should be -100000 (empty - populated)
    expect(result.revenue.deltaAbsolute[0]?.value).toBe(-100000);

    // Now reverse: empty as base, populated as compare
    const reversed = compareScenarios(empty, populated);
    expect(reversed.revenue.baseValues[0]?.value).toBe(0);
    expect(reversed.revenue.compareValues[0]?.value).toBe(100000);
    expect(reversed.revenue.deltaAbsolute[0]?.value).toBe(100000);
  });

  it("comparing many scenarios sequentially does not cause accumulation errors", () => {
    const base = makeScenario("b", "Base", {
      revenue: new Map([["2026-01", 10000]]),
    });

    // Compare base against 5 different scenarios
    const results: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const other = makeScenario(`s${i}`, `Scenario ${i}`, {
        revenue: new Map([["2026-01", 10000 * (i + 1)]]),
      });
      const result = compareScenarios(base, other);
      results.push(result.revenue.deltaAbsolute[0]?.value ?? 0);
    }

    // Each delta should be independent: (i+1)*10000 - 10000
    expect(results).toEqual([10000, 20000, 30000, 40000, 50000]);

    // Base should still have its original revenue
    expect(base.aggregates.revenue.get("2026-01")).toBe(10000);
  });

  it("financial precision: comparison handles decimal values without rounding errors", () => {
    const base = makeScenario("b", "Base", {
      revenue: new Map([["2026-01", 33333.33]]),
    });
    const compare = makeScenario("c", "Compare", {
      revenue: new Map([["2026-01", 66666.67]]),
    });

    const result = compareScenarios(base, compare);
    // 66666.67 - 33333.33 = 33333.34
    expect(result.revenue.deltaAbsolute[0]?.value).toBe(33333.34);
  });

  it("scenario accounts Map is independent between scenarios", () => {
    const accounts1 = new Map<string, MonthlySeries>();
    accounts1.set("rent", new Map([["2026-01", 5000]]));

    const accounts2 = new Map<string, MonthlySeries>();
    accounts2.set("rent", new Map([["2026-01", 8000]]));
    accounts2.set("salaries", new Map([["2026-01", 100000]]));

    const s1 = makeScenario("s1", "S1", {}, accounts1);
    const s2 = makeScenario("s2", "S2", {}, accounts2);

    // Mutate s2's accounts — should NOT affect s1
    accounts2.get("rent")?.set("2026-01", 99999);

    // s1 should still have 5000 for rent
    expect(s1.accounts.get("rent")?.get("2026-01")).toBe(5000);
  });
});
