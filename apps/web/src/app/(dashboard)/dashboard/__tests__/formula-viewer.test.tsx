/**
 * DASH-10: the formula viewer must render a friendly label for a metric's
 * format (Money / Percentage / Months / …) rather than leaking the raw
 * MetricFormat enum token uppercased (CURRENCY / PERCENT / MONTHS).
 *
 * The label map (FORMAT_LABELS) is single-source in @burnless/engine and must
 * cover every MetricFormat union member with a plain-word label (no currency
 * symbols — guarded separately by no-currency-in-engine in the engine package).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORMAT_LABELS, METRIC_REGISTRY } from "@burnless/engine";

describe("FORMAT_LABELS (DASH-10)", () => {
  it("maps every format used in the registry to a friendly, non-uppercased label", () => {
    const usedFormats = new Set(Object.values(METRIC_REGISTRY).map((m) => m.format));
    for (const fmt of usedFormats) {
      const label = FORMAT_LABELS[fmt];
      expect(label, `format ${fmt}`).toBeTruthy();
      // The bug leaked the UPPERCASED enum token ("CURRENCY"/"MONTHS"). The
      // friendly label must never be that all-caps token.
      expect(label, `format ${fmt}`).not.toBe(fmt.toUpperCase());
    }
  });

  it("uses the expected friendly words", () => {
    expect(FORMAT_LABELS.currency).toBe("Money");
    expect(FORMAT_LABELS.percent).toBe("Percentage");
    expect(FORMAT_LABELS.months).toBe("Months");
    expect(FORMAT_LABELS.number).toBe("Number");
    expect(FORMAT_LABELS.ratio).toBe("Ratio");
    expect(FORMAT_LABELS.multiple).toBe("Multiple");
    expect(FORMAT_LABELS.boolean).toBe("Yes/No");
  });

  it("contains no currency symbols (plain words only)", () => {
    for (const label of Object.values(FORMAT_LABELS)) {
      expect(label).not.toMatch(/[$€£¥₹]/);
    }
  });
});

describe("formula-viewer consumes FORMAT_LABELS (DASH-10)", () => {
  const source = readFileSync(join(__dirname, "..", "formula-viewer.tsx"), "utf8");

  it("renders FORMAT_LABELS[metric.format], not the raw enum token", () => {
    expect(source).toContain("FORMAT_LABELS[metric.format]");
    // The old raw render must be gone.
    expect(source).not.toMatch(/>\s*\{metric\.format\}\s*</);
  });

  it("drops the CSS uppercase class from the format badge span", () => {
    // The badge that renders the format label must no longer force uppercase
    // (which produced "CURRENCY"). The label is already cased correctly.
    expect(source).toContain('className="text-[10px] text-surface-400">');
    expect(source).not.toContain('className="text-[10px] text-surface-400 uppercase"');
  });
});
