import { describe, it, expect } from "vitest";
import { compareScenarios, type ScenarioData } from "../scenarios";

describe("scenario comparison", () => {
  function makeScenario(
    id: string,
    name: string,
    overrides: Partial<ScenarioData["aggregates"]> = {},
    accounts: Map<string, Map<string, number>> = new Map()
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

  it("computes deltas between two scenarios", () => {
    const base = makeScenario("s1", "Base");
    const compare = makeScenario("s2", "Aggressive", {
      revenue: new Map([["2026-01", 70000], ["2026-02", 80000]]),
    });

    const result = compareScenarios(base, compare);

    expect(result.baseScenario).toBe("Base");
    expect(result.compareScenario).toBe("Aggressive");

    // Revenue: 70000 - 50000 = 20000
    expect(result.revenue.deltaAbsolute[0]?.value).toBe(20000);
    // 20000 / 50000 * 100 = 40%
    expect(result.revenue.deltaPercent[0]?.value).toBe(40);
  });

  it("handles identical scenarios (zero delta)", () => {
    const base = makeScenario("s1", "Base");
    const compare = makeScenario("s2", "Same");

    const result = compareScenarios(base, compare);
    for (const d of result.revenue.deltaAbsolute) {
      expect(d.value).toBe(0);
    }
    for (const d of result.revenue.deltaPercent) {
      expect(d.value).toBe(0);
    }
  });

  it("handles negative deltas (compare < base)", () => {
    const base = makeScenario("s1", "Base", {
      revenue: new Map([["2026-01", 100000]]),
    });
    const compare = makeScenario("s2", "Conservative", {
      revenue: new Map([["2026-01", 60000]]),
    });

    const result = compareScenarios(base, compare);
    expect(result.revenue.deltaAbsolute[0]?.value).toBe(-40000);
    expect(result.revenue.deltaPercent[0]?.value).toBe(-40);
  });

  it("handles zero base value (no divide-by-zero)", () => {
    const base = makeScenario("s1", "Base", {
      revenue: new Map([["2026-01", 0]]),
    });
    const compare = makeScenario("s2", "Growth", {
      revenue: new Map([["2026-01", 50000]]),
    });

    const result = compareScenarios(base, compare);
    expect(result.revenue.deltaAbsolute[0]?.value).toBe(50000);
    expect(result.revenue.deltaPercent[0]?.value).toBe(0); // 0% when base is 0
  });

  it("compares accounts that exist in only one scenario", () => {
    const baseAccounts = new Map<string, Map<string, number>>();
    baseAccounts.set("acc1", new Map([["2026-01", 1000]]));

    const compareAccounts = new Map<string, Map<string, number>>();
    compareAccounts.set("acc2", new Map([["2026-01", 2000]]));

    const base = makeScenario("s1", "Base", {}, baseAccounts);
    const compare = makeScenario("s2", "Compare", {}, compareAccounts);

    const result = compareScenarios(base, compare);
    // acc1 only in base: delta = 0 - 1000 = -1000
    expect(result.accountComparisons.get("acc1")?.deltaAbsolute[0]?.value).toBe(-1000);
    // acc2 only in compare: delta = 2000 - 0 = 2000
    expect(result.accountComparisons.get("acc2")?.deltaAbsolute[0]?.value).toBe(2000);
  });

  it("compares scenarios with different month ranges", () => {
    const base = makeScenario("s1", "Base", {
      revenue: new Map([["2026-01", 10000]]),
    });
    const compare = makeScenario("s2", "Extended", {
      revenue: new Map([["2026-01", 10000], ["2026-02", 20000]]),
    });

    const result = compareScenarios(base, compare);
    // Both have Jan → 0 delta
    expect(result.revenue.deltaAbsolute[0]?.value).toBe(0);
    // Only compare has Feb → base is 0
    expect(result.revenue.deltaAbsolute[1]?.value).toBe(20000);
  });

  it("includes all aggregate comparison lines", () => {
    const base = makeScenario("s1", "Base");
    const compare = makeScenario("s2", "Compare");
    const result = compareScenarios(base, compare);

    expect(result.revenue).toBeDefined();
    expect(result.expenses).toBeDefined();
    expect(result.netIncome).toBeDefined();
    expect(result.cashPosition).toBeDefined();
    expect(result.headcount).toBeDefined();
  });
});
