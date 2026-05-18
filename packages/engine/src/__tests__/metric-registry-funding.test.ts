import { describe, it, expect } from "vitest";
import {
  METRIC_REGISTRY,
  getMetricChildren,
  ENTITY_METRIC_IMPACT,
} from "../metric-registry";

describe("Phase 2 D registry edits", () => {
  it("cashRunwayMonths description references debt service", () => {
    const m = METRIC_REGISTRY.find((x) => x.slug === "cashRunwayMonths")!;
    expect(m.description).toMatch(/debt service/i);
    expect(m.formula).toMatch(/Debt Service|Principal/);
  });

  it("netBurnRate description references principal exclusion", () => {
    const m = METRIC_REGISTRY.find((x) => x.slug === "netBurnRate")!;
    expect(m.description).toMatch(/debt principal|excludes/i);
  });

  it("totalOwnership parent exists with 4 children summing to 100%", () => {
    const parent = METRIC_REGISTRY.find((x) => x.slug === "totalOwnership")!;
    expect(parent).toBeDefined();
    expect(parent.format).toBe("percentage");
    const children = getMetricChildren("totalOwnership");
    const slugs = children.map((c) => c.slug).sort();
    expect(slugs).toEqual([
      "commonStockOwnership",
      "optionPoolOverhang",
      "preferredStockOwnership",
      "safeOverhang",
    ]);
    for (const c of children) {
      expect(c.parentMetricId).toBe("totalOwnership");
      expect(c.format).toBe("percentage");
    }
  });

  it("interestExpense metric exists with operating category", () => {
    const m = METRIC_REGISTRY.find((x) => x.slug === "interestExpense")!;
    expect(m).toBeDefined();
    expect(m.format).toBe("currency");
  });

  it("ENTITY_METRIC_IMPACT.funding includes meaning-changed metrics", () => {
    expect(ENTITY_METRIC_IMPACT.funding).toEqual(
      expect.arrayContaining([
        "cashPosition",
        "cashRunwayMonths",
        "netBurnRate",
        "interestExpense",
        "totalOwnership",
      ]),
    );
  });
});
