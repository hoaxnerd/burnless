import { describe, it, expect } from "vitest";
import {
  METRIC_REGISTRY,
  formatMetricValue,
  getMetricMissingDataHint,
  type MetricFormat,
} from "../metric-registry";

const VALID_FORMATS: MetricFormat[] = [
  "currency",
  "percent",
  "number",
  "months",
  "ratio",
  "multiple",
  "boolean",
];

describe("metric-registry consistency (Phase 3 F §1.4 sweep)", () => {
  it("every registry entry's format is a valid MetricFormat token", () => {
    for (const def of METRIC_REGISTRY) {
      expect(VALID_FORMATS).toContain(def.format);
    }
  });

  it("formatMetricValue handles every format token without falling through to default", () => {
    const probes: Record<MetricFormat, number> = {
      currency: 1234.5,
      percent: 50,
      number: 42,
      months: 18,
      ratio: 1.5,
      multiple: 2.3,
      boolean: 1,
    };
    for (const format of VALID_FORMATS) {
      const out = formatMetricValue(probes[format], format);
      expect(out).toBeTruthy();
      // "number" format output equals toString() for the integer probe, so the
      // not-toBe check would be tautological; skip it for that branch only.
      if (format !== "number") {
        if (format === "currency") {
          // Engine is currency-agnostic — formatMetricValue returns the raw
          // stringified number (umbrella §1.6).
          expect(out).toBe(probes[format].toString());
        } else {
          expect(out).not.toBe(probes[format].toString());
        }
      }
    }
  });

  it("every child's parentMetricId points to an existing parent slug", () => {
    const knownSlugs = new Set(METRIC_REGISTRY.map((m) => m.slug));
    for (const def of METRIC_REGISTRY) {
      if (def.parentMetricId) {
        expect(knownSlugs).toContain(def.parentMetricId);
      }
    }
  });

  it("every NaN-gated dark metric has a SPECIFIC data-requirement hint (Phase 5.8)", () => {
    // These slugs ghost via NaN when their distinguishing input is absent
    // (acquisition/retention spend, active users, infinite-LTV churn, OCF /
    // current-assets/liabilities, interest series). The ghost card shows a
    // hint instead of a wrong 0, so the hint MUST name the missing input —
    // not fall through to the generic dependsOn/SaaS/"More data needed"
    // fallback in getMetricMissingDataHint.
    const GATED_SLUGS = [
      "cac",
      "ltvCacRatio",
      "cacPaybackMonths",
      "magicNumber",
      "customerRetentionCost",
      "arpu",
      "ltv",
      "workingCapital",
      "interestExpense",
    ];
    // Generic fallbacks that getMetricMissingDataHint produces when NO specific
    // entry exists — a gated slug landing on any of these is a FAIL.
    const GENERIC_FALLBACKS = [
      "More data needed",
      "Add subscription data to see this metric",
    ];
    for (const slug of GATED_SLUGS) {
      expect(
        METRIC_REGISTRY.some((m) => m.slug === slug),
        `gated slug ${slug} must exist in the registry`,
      ).toBe(true);
      const hint = getMetricMissingDataHint(slug);
      expect(hint, `gated slug ${slug} must have a hint`).toBeTruthy();
      expect(
        GENERIC_FALLBACKS,
        `gated slug ${slug} returned the generic fallback "${hint}" — add a specific DATA_REQUIREMENT_HINTS entry`,
      ).not.toContain(hint);
      // The dependsOn fallback shape "Requires X & Y" is also generic.
      expect(
        hint.startsWith("Requires "),
        `gated slug ${slug} fell through to the dependsOn fallback "${hint}" — add a specific DATA_REQUIREMENT_HINTS entry`,
      ).toBe(false);
    }
  });

  it("every parent metric (i.e. has children) declares aiContext explicitly", () => {
    const parentSlugs = new Set(
      METRIC_REGISTRY
        .filter((m) => m.parentMetricId)
        .map((m) => m.parentMetricId!),
    );
    for (const slug of parentSlugs) {
      const parent = METRIC_REGISTRY.find((m) => m.slug === slug);
      expect(parent, `parent metric ${slug} not found in registry`).toBeDefined();
      expect(
        parent!.aiContext,
        `parent metric ${slug} must declare aiContext explicitly (Phase 3 F §F2)`,
      ).toBeDefined();
    }
  });
});
