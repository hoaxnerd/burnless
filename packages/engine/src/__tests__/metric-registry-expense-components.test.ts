import { describe, expect, it } from "vitest";
import { getMetricChildren, getMetricDef } from "../metric-registry";

const PARENT = "totalOpex";

describe(`${PARENT} parent + components`, () => {
  it("totalOpex parent metric is defined", () => {
    const m = getMetricDef(PARENT);
    expect(m, "totalOpex parent must exist").toBeDefined();
    expect(m!.format).toBe("currency");
    expect(m!.category).toBe("expense");
    expect(m!.parentMetricId).toBeUndefined(); // it's a parent, not a child
  });

  it("has fixed/variable/percentage/oneTime components", () => {
    const slugs = getMetricChildren(PARENT).map((m) => m.slug).sort();
    expect(slugs).toEqual(
      ["fixedExpenses", "variableExpenses", "percentageDrivenExpenses", "oneTimeExpenses"].sort(),
    );
  });

  it("each component declares the parent and category=expense", () => {
    for (const slug of ["fixedExpenses", "variableExpenses", "percentageDrivenExpenses", "oneTimeExpenses"]) {
      const m = getMetricDef(slug);
      expect(m, `${slug} missing`).toBeDefined();
      expect(m!.parentMetricId).toBe(PARENT);
      expect(m!.format).toBe("currency");
    }
  });
});
