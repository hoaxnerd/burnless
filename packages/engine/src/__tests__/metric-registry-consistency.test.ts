import { describe, it, expect } from "vitest";
import {
  METRIC_REGISTRY,
  formatMetricValue,
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
