import { describe, it, expect } from "vitest";
import {
  METRIC_REGISTRY,
  getMetricDef,
  getMetricChildren,
  getMetricAiInclude,
  type MetricDefinition,
} from "../metric-registry";

function baseFixture(): MetricDefinition {
  return {
    slug: "_base",
    name: "B",
    description: "b",
    formula: "b",
    dependsOn: [],
    category: "revenue",
    tier: "deep",
    format: "number",
    direction: "neutral",
    icon: "Coins",
    color: "emerald",
    href: "/",
  };
}

describe("MetricDefinition schema — parentMetricId + aiContext (umbrella §1.4)", () => {
  it("parentMetricId is optional on the type", () => {
    const def: MetricDefinition = {
      ...baseFixture(),
      slug: "_test_child",
      parentMetricId: "totalRevenue",
    };
    expect(def.parentMetricId).toBe("totalRevenue");
  });

  it("aiContext is optional and accepts the three include values", () => {
    const a: MetricDefinition = { ...baseFixture(), aiContext: { include: "parent_only" } };
    const b: MetricDefinition = { ...baseFixture(), aiContext: { include: "components_only" } };
    const c: MetricDefinition = { ...baseFixture(), aiContext: { include: "both" } };
    expect(a.aiContext?.include).toBe("parent_only");
    expect(b.aiContext?.include).toBe("components_only");
    expect(c.aiContext?.include).toBe("both");
  });

  it("getMetricChildren returns metrics whose parentMetricId matches the argument", () => {
    const synthetic: MetricDefinition[] = [
      { ...baseFixture(), slug: "parent_x" },
      { ...baseFixture(), slug: "child_a", parentMetricId: "parent_x" },
      { ...baseFixture(), slug: "child_b", parentMetricId: "parent_x" },
      { ...baseFixture(), slug: "unrelated" },
    ];
    expect(
      getMetricChildren("parent_x", synthetic).map((m) => m.slug).sort()
    ).toEqual(["child_a", "child_b"]);
    expect(getMetricChildren("unrelated", synthetic)).toEqual([]);
  });

  it("existing registry entries remain valid (no parentMetricId required)", () => {
    for (const entry of METRIC_REGISTRY) {
      if (entry.parentMetricId !== undefined) {
        const parent = getMetricDef(entry.parentMetricId);
        expect(parent, `parent ${entry.parentMetricId} of ${entry.slug} must exist`).toBeDefined();
      }
    }
  });

  it("aiContext.include defaults to 'both' via the exposed accessor", () => {
    const anyExisting = METRIC_REGISTRY[0]!;
    expect(getMetricAiInclude(anyExisting.slug)).toBe("both");
  });
});
