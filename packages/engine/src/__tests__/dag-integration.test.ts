import { describe, it, expect } from "vitest";
import {
  computeAllForecastLines,
  buildForecastDependencyGraph,
  type ForecastLineInput,
} from "../forecasting";
import { computeCustomMetrics, type CustomMetricDefinition, type MetricValue, type ComputedMetrics } from "../metrics";
import { CircularDependencyError } from "../dag";

describe("DAG-based forecast line resolution", () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 2, 1); // 3 months

  it("resolves a chain A → B → C (3 levels of percentage_of)", () => {
    const lines: ForecastLineInput[] = [
      {
        id: "revenue",
        accountId: "a1",
        method: "fixed",
        parameters: { amount: 100000 },
        startDate: start,
        endDate: null,
      },
      {
        id: "cogs",
        accountId: "a2",
        method: "percentage_of",
        parameters: { sourceLineId: "revenue", percentage: 0.30 },
        startDate: start,
        endDate: null,
      },
      {
        id: "cogs_overhead",
        accountId: "a3",
        method: "percentage_of",
        parameters: { sourceLineId: "cogs", percentage: 0.10 },
        startDate: start,
        endDate: null,
      },
    ];

    const results = computeAllForecastLines(lines, start, end);

    // revenue = 100000
    expect(results.get("revenue")!.get("2026-01")).toBe(100000);
    // cogs = 30% of revenue = 30000
    expect(results.get("cogs")!.get("2026-01")).toBe(30000);
    // cogs_overhead = 10% of cogs = 3000
    expect(results.get("cogs_overhead")!.get("2026-01")).toBe(3000);
  });

  it("resolves 4-level deep chain", () => {
    const lines: ForecastLineInput[] = [
      { id: "base", accountId: "a", method: "fixed", parameters: { amount: 10000 }, startDate: start, endDate: null },
      { id: "l1", accountId: "a", method: "percentage_of", parameters: { sourceLineId: "base", percentage: 0.50 }, startDate: start, endDate: null },
      { id: "l2", accountId: "a", method: "percentage_of", parameters: { sourceLineId: "l1", percentage: 0.50 }, startDate: start, endDate: null },
      { id: "l3", accountId: "a", method: "percentage_of", parameters: { sourceLineId: "l2", percentage: 0.50 }, startDate: start, endDate: null },
    ];

    const results = computeAllForecastLines(lines, start, end);
    expect(results.get("base")!.get("2026-01")).toBe(10000);
    expect(results.get("l1")!.get("2026-01")).toBe(5000);
    expect(results.get("l2")!.get("2026-01")).toBe(2500);
    expect(results.get("l3")!.get("2026-01")).toBe(1250);
  });

  it("throws CircularDependencyError on circular percentage_of", () => {
    const lines: ForecastLineInput[] = [
      {
        id: "a",
        accountId: "acc",
        method: "percentage_of",
        parameters: { sourceLineId: "b", percentage: 0.50 },
        startDate: start,
        endDate: null,
      },
      {
        id: "b",
        accountId: "acc",
        method: "percentage_of",
        parameters: { sourceLineId: "a", percentage: 0.50 },
        startDate: start,
        endDate: null,
      },
    ];

    expect(() => computeAllForecastLines(lines, start, end)).toThrow(
      CircularDependencyError
    );
  });

  it("throws CircularDependencyError on indirect 3-node cycle", () => {
    const lines: ForecastLineInput[] = [
      { id: "x", accountId: "a", method: "percentage_of", parameters: { sourceLineId: "z", percentage: 0.1 }, startDate: start, endDate: null },
      { id: "y", accountId: "a", method: "percentage_of", parameters: { sourceLineId: "x", percentage: 0.1 }, startDate: start, endDate: null },
      { id: "z", accountId: "a", method: "percentage_of", parameters: { sourceLineId: "y", percentage: 0.1 }, startDate: start, endDate: null },
    ];

    expect(() => computeAllForecastLines(lines, start, end)).toThrow(
      CircularDependencyError
    );
  });

  it("handles mixed dependent and independent lines", () => {
    const lines: ForecastLineInput[] = [
      { id: "salary", accountId: "opex", method: "fixed", parameters: { amount: 50000 }, startDate: start, endDate: null },
      { id: "revenue", accountId: "rev", method: "growth_rate", parameters: { baseAmount: 80000, monthlyGrowthRate: 0.10 }, startDate: start, endDate: null },
      { id: "tax", accountId: "tax", method: "percentage_of", parameters: { sourceLineId: "revenue", percentage: 0.20 }, startDate: start, endDate: null },
      { id: "bonus", accountId: "opex", method: "percentage_of", parameters: { sourceLineId: "salary", percentage: 0.10 }, startDate: start, endDate: null },
    ];

    const results = computeAllForecastLines(lines, start, end);
    expect(results.get("salary")!.get("2026-01")).toBe(50000);
    expect(results.get("revenue")!.get("2026-01")).toBe(80000);
    expect(results.get("tax")!.get("2026-01")).toBe(16000); // 20% of 80000
    expect(results.get("bonus")!.get("2026-01")).toBe(5000); // 10% of 50000
  });

  it("produces same results regardless of input order", () => {
    const makeLine = (id: string, method: string, params: Record<string, unknown>): ForecastLineInput => ({
      id,
      accountId: "a",
      method: method as ForecastLineInput["method"],
      parameters: params,
      startDate: start,
      endDate: null,
    });

    const lines = [
      makeLine("base", "fixed", { amount: 1000 }),
      makeLine("mid", "percentage_of", { sourceLineId: "base", percentage: 0.5 }),
      makeLine("top", "percentage_of", { sourceLineId: "mid", percentage: 0.5 }),
    ];

    // Original order
    const r1 = computeAllForecastLines(lines, start, end);

    // Reversed order
    const r2 = computeAllForecastLines([...lines].reverse(), start, end);

    // Shuffled order
    const r3 = computeAllForecastLines([lines[2]!, lines[0]!, lines[1]!], start, end);

    for (const id of ["base", "mid", "top"]) {
      for (const m of ["2026-01", "2026-02", "2026-03"]) {
        expect(r1.get(id)!.get(m)).toBe(r2.get(id)!.get(m));
        expect(r1.get(id)!.get(m)).toBe(r3.get(id)!.get(m));
      }
    }
  });
});

describe("buildForecastDependencyGraph", () => {
  const start = new Date(2026, 0, 1);

  it("builds graph with correct dependencies", () => {
    const lines: ForecastLineInput[] = [
      { id: "a", accountId: "x", method: "fixed", parameters: { amount: 100 }, startDate: start, endDate: null },
      { id: "b", accountId: "x", method: "percentage_of", parameters: { sourceLineId: "a", percentage: 0.5 }, startDate: start, endDate: null },
      { id: "c", accountId: "x", method: "percentage_of", parameters: { sourceLineId: "b", percentage: 0.5 }, startDate: start, endDate: null },
    ];

    const graph = buildForecastDependencyGraph(lines);
    expect(graph.getDependencies("a").size).toBe(0);
    expect(graph.getDependencies("b").has("a")).toBe(true);
    expect(graph.getDependencies("c").has("b")).toBe(true);
  });

  it("ignores sourceLineId that does not exist in lines", () => {
    const lines: ForecastLineInput[] = [
      { id: "a", accountId: "x", method: "percentage_of", parameters: { sourceLineId: "nonexistent", percentage: 0.5 }, startDate: start, endDate: null },
    ];

    const graph = buildForecastDependencyGraph(lines);
    expect(graph.getDependencies("a").size).toBe(0);
  });
});

describe("computeCustomMetrics", () => {
  const months = ["2026-01", "2026-02", "2026-03"];

  function makeMetricValues(values: number[]): MetricValue[] {
    return values.map((v, i) => ({ month: months[i]!, value: v }));
  }

  // Minimal ComputedMetrics stub for testing
  function makeBuiltInMetrics(overrides: Partial<ComputedMetrics> = {}): ComputedMetrics {
    const empty = makeMetricValues([0, 0, 0]);
    return {
      mrr: makeMetricValues([10000, 11000, 12000]),
      arr: empty, totalRevenue: makeMetricValues([10000, 11000, 12000]),
      revenueRunRate: empty, newMrr: empty, expansionMrr: empty,
      churnedMrr: empty, netNewMrr: empty, totalCustomers: makeMetricValues([100, 110, 120]),
      newCustomersPerMonth: empty, churnedCustomersPerMonth: empty,
      customerChurnRate: makeMetricValues([5, 5, 5]),
      revenueChurnRate: empty, ltv: makeMetricValues([2000, 2200, 2400]),
      cac: makeMetricValues([500, 500, 500]),
      ltvCacRatio: empty, cacPaybackMonths: empty,
      arpa: makeMetricValues([100, 100, 100]),
      saasQuickRatio: empty, magicNumber: empty,
      burnRate: empty, netBurnRate: empty, cashRunwayMonths: empty,
      cashPosition: empty, grossProfit: makeMetricValues([7000, 7700, 8400]),
      grossMarginPercent: makeMetricValues([70, 70, 70]),
      operatingIncome: empty, netIncome: empty, ebitda: empty,
      revenueGrowthRate: empty, mrrGrowthRate: empty, customerGrowthRate: empty,
      revenuePerEmployee: empty, burnMultiple: empty, ruleOf40: empty,
      ...overrides,
    };
  }

  it("computes a single custom metric referencing built-in metrics", () => {
    const builtIn = makeBuiltInMetrics();

    const customDefs: CustomMetricDefinition[] = [
      {
        id: "revenuePerCustomer",
        name: "Revenue Per Customer",
        dependsOn: ["totalRevenue", "totalCustomers"],
        compute: (deps) => {
          const rev = deps.get("totalRevenue")!;
          const cust = deps.get("totalCustomers")!;
          return rev.map((r, i) => ({
            month: r.month,
            value: cust[i]!.value === 0 ? 0 : Math.round((r.value / cust[i]!.value) * 100) / 100,
          }));
        },
      },
    ];

    const result = computeCustomMetrics(builtIn, customDefs, months);
    const rpc = result.get("revenuePerCustomer")!;
    expect(rpc[0]!.value).toBe(100); // 10000 / 100
    expect(rpc[1]!.value).toBe(100); // 11000 / 110
    expect(rpc[2]!.value).toBe(100); // 12000 / 120
  });

  it("resolves chained custom metrics (A depends on B which depends on built-in)", () => {
    const builtIn = makeBuiltInMetrics();

    const customDefs: CustomMetricDefinition[] = [
      {
        id: "grossProfitPerCustomer",
        name: "Gross Profit Per Customer",
        dependsOn: ["grossProfit", "totalCustomers"],
        compute: (deps) => {
          const gp = deps.get("grossProfit")!;
          const cust = deps.get("totalCustomers")!;
          return gp.map((g, i) => ({
            month: g.month,
            value: cust[i]!.value === 0 ? 0 : Math.round((g.value / cust[i]!.value) * 100) / 100,
          }));
        },
      },
      {
        id: "gppcGrowthFlag",
        name: "GPPC Growth Flag",
        dependsOn: ["grossProfitPerCustomer"],
        compute: (deps) => {
          const gppc = deps.get("grossProfitPerCustomer")!;
          return gppc.map((v, i) => ({
            month: v.month,
            value: i > 0 && v.value > gppc[i - 1]!.value ? 1 : 0,
          }));
        },
      },
    ];

    const result = computeCustomMetrics(builtIn, customDefs, months);
    const gppc = result.get("grossProfitPerCustomer")!;
    expect(gppc[0]!.value).toBe(70); // 7000 / 100
    expect(gppc[1]!.value).toBe(70); // 7700 / 110
    expect(gppc[2]!.value).toBe(70); // 8400 / 120

    const flag = result.get("gppcGrowthFlag")!;
    expect(flag[0]!.value).toBe(0); // no previous
    expect(flag[1]!.value).toBe(0); // 70 = 70, no growth
    expect(flag[2]!.value).toBe(0); // 70 = 70, no growth
  });

  it("throws CircularDependencyError on circular custom metrics", () => {
    const builtIn = makeBuiltInMetrics();

    const customDefs: CustomMetricDefinition[] = [
      {
        id: "metricA",
        name: "A",
        dependsOn: ["metricB"],
        compute: () => [],
      },
      {
        id: "metricB",
        name: "B",
        dependsOn: ["metricA"],
        compute: () => [],
      },
    ];

    expect(() => computeCustomMetrics(builtIn, customDefs, months)).toThrow(
      CircularDependencyError
    );
  });

  it("throws on unknown dependency reference", () => {
    const builtIn = makeBuiltInMetrics();

    const customDefs: CustomMetricDefinition[] = [
      {
        id: "bad",
        name: "Bad Metric",
        dependsOn: ["nonexistentMetric"],
        compute: () => [],
      },
    ];

    expect(() => computeCustomMetrics(builtIn, customDefs, months)).toThrow(
      'depends on unknown metric "nonexistentMetric"'
    );
  });

  it("returns empty map for empty definitions", () => {
    const builtIn = makeBuiltInMetrics();
    const result = computeCustomMetrics(builtIn, [], months);
    expect(result.size).toBe(0);
  });
});
