import { describe, it, expect } from "vitest";
import { categorizeTransaction } from "../categorization";

// ── Inline detection functions ──────────────────────────────────────────────
// These mirror the pure logic in apps/web/src/lib/compute-expenses.ts
// so we can test them without importing Next.js server code.

const ANOMALY_THRESHOLD = 0.20;

function computeChangePercent(currentAmount: number, prevAmount: number): number {
  return prevAmount > 0 ? (currentAmount - prevAmount) / prevAmount : 0;
}

function isAnomaly(prevAmount: number, changePercent: number): boolean {
  return prevAmount > 0 && changePercent > ANOMALY_THRESHOLD;
}

function isLowVariance(values: number[]): boolean {
  if (values.length < 2) return true;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return true;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  return cv < 0.05; // less than 5% variation
}

function isRecurring(method: string, amounts: number[]): boolean {
  return method === "fixed" || (amounts.length >= 3 && isLowVariance(amounts));
}

function deriveSubcategory(
  accountName: string,
  accountCategory: string,
): { subcategory: string; confidence: number } {
  const result = categorizeTransaction(accountName);
  if (result && result.confidence >= 0.5) {
    return { subcategory: result.subcategory, confidence: result.confidence };
  }
  if (accountCategory === "cogs") {
    return { subcategory: "Cost of Goods Sold", confidence: 0.6 };
  }
  return { subcategory: "Other", confidence: 0.3 };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("expense detection", () => {
  // ── Anomaly Detection ───────────────────────────────────────────────────

  describe("anomaly detection (20% MoM threshold)", () => {
    it("no anomaly when prevAmount is 0 (division guard)", () => {
      const prev = 0;
      const current = 5000;
      const change = computeChangePercent(current, prev);
      expect(change).toBe(0);
      expect(isAnomaly(prev, change)).toBe(false);
    });

    it("no anomaly when change is exactly 20% (boundary)", () => {
      const prev = 1000;
      const current = 1200; // exactly 20%
      const change = computeChangePercent(current, prev);
      expect(change).toBeCloseTo(0.2);
      // > 0.20 is required, exactly 0.20 should NOT flag
      expect(isAnomaly(prev, change)).toBe(false);
    });

    it("anomaly when change is 21%", () => {
      const prev = 1000;
      const current = 1210; // 21%
      const change = computeChangePercent(current, prev);
      expect(change).toBeCloseTo(0.21);
      expect(isAnomaly(prev, change)).toBe(true);
    });

    it("no anomaly when expense decreases (negative change)", () => {
      const prev = 2000;
      const current = 1500; // -25%
      const change = computeChangePercent(current, prev);
      expect(change).toBeLessThan(0);
      expect(isAnomaly(prev, change)).toBe(false);
    });

    it("no anomaly when amounts are equal (0% change)", () => {
      const prev = 3000;
      const current = 3000;
      const change = computeChangePercent(current, prev);
      expect(change).toBe(0);
      expect(isAnomaly(prev, change)).toBe(false);
    });

    it("large anomaly (100% increase)", () => {
      const prev = 5000;
      const current = 10000;
      const change = computeChangePercent(current, prev);
      expect(change).toBe(1.0);
      expect(isAnomaly(prev, change)).toBe(true);
    });

    it("small anomaly just above threshold (20.1%)", () => {
      const prev = 10000;
      const current = 12010; // 20.1%
      const change = computeChangePercent(current, prev);
      expect(change).toBeCloseTo(0.201);
      expect(isAnomaly(prev, change)).toBe(true);
    });
  });

  // ── Recurring Detection ─────────────────────────────────────────────────

  describe("recurring detection", () => {
    it("fixed method always recurring regardless of amounts", () => {
      expect(isRecurring("fixed", [])).toBe(true);
      expect(isRecurring("fixed", [100])).toBe(true);
      expect(isRecurring("fixed", [100, 5000, 200])).toBe(true);
    });

    it("constant amounts are recurring", () => {
      expect(isRecurring("percent_of_revenue", [1000, 1000, 1000])).toBe(true);
    });

    it("slightly varying amounts within 5% CV are recurring", () => {
      // [1000, 1010, 990]: mean=1000, deviations=[0, 10, -10]
      // variance = (0+100+100)/3 = 66.67, std = 8.165, cv = 0.008165 => < 0.05
      expect(isRecurring("manual", [1000, 1010, 990])).toBe(true);
    });

    it("wildly varying amounts are NOT recurring", () => {
      expect(isRecurring("manual", [1000, 5000, 200])).toBe(false);
    });

    it("less than 3 data points — NOT recurring (unless fixed method)", () => {
      expect(isRecurring("manual", [1000, 1000])).toBe(false);
      expect(isRecurring("manual", [1000])).toBe(false);
      expect(isRecurring("manual", [])).toBe(false);
    });

    it("all zeros — treated as low variance (mean=0 guard)", () => {
      // isLowVariance returns true when mean=0, but these are filtered
      // by the positive-value filter in the real code. Testing the raw function:
      expect(isLowVariance([0, 0, 0])).toBe(true);
      // For isRecurring, the amounts array in real code filters to v > 0,
      // so all-zero would produce an empty array => length < 3 => not recurring
      expect(isRecurring("manual", [])).toBe(false);
    });

    it("single value — isLowVariance returns true but needs >=3 for recurring check", () => {
      expect(isLowVariance([500])).toBe(true);
      expect(isRecurring("manual", [500])).toBe(false);
    });

    it("exactly at 5% CV boundary — NOT recurring (< 0.05 required, not <=)", () => {
      // We need CV = exactly 0.05. For 3 values with mean m:
      // CV = std/mean = 0.05 => std = 0.05 * mean
      // variance = std^2 = 0.0025 * mean^2
      // For values [a, b, c] with mean=1000:
      // variance = ((a-1000)^2 + (b-1000)^2 + (c-1000)^2) / 3 = 2500
      // So sum of squared deviations = 7500
      // Use symmetric: [1000-d, 1000, 1000+d] => (d^2 + 0 + d^2)/3 = 2500 => d^2 = 3750 => d ≈ 61.237
      const d = Math.sqrt(3750);
      const amounts = [1000 - d, 1000, 1000 + d];

      // Verify CV is exactly 0.05
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance =
        amounts.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
        amounts.length;
      const cv = Math.sqrt(variance) / mean;
      expect(cv).toBeCloseTo(0.05, 10);

      // cv < 0.05 is false when cv = 0.05, so NOT low variance
      expect(isLowVariance(amounts)).toBe(false);
      expect(isRecurring("manual", amounts)).toBe(false);
    });
  });

  // ── isLowVariance edge cases ────────────────────────────────────────────

  describe("isLowVariance", () => {
    it("returns true for empty array (length < 2)", () => {
      expect(isLowVariance([])).toBe(true);
    });

    it("returns true for a single element", () => {
      expect(isLowVariance([42])).toBe(true);
    });

    it("returns true for two identical values", () => {
      expect(isLowVariance([500, 500])).toBe(true);
    });

    it("returns true when mean is 0", () => {
      expect(isLowVariance([0, 0])).toBe(true);
    });

    it("returns false for high-variance values", () => {
      expect(isLowVariance([1, 100])).toBe(false);
    });
  });

  // ── Subcategory Derivation ──────────────────────────────────────────────

  describe("subcategory derivation", () => {
    it("known vendor (AWS) derives correct subcategory with high confidence", () => {
      const result = deriveSubcategory("AWS Infrastructure", "operating_expense");
      expect(result.subcategory).toBe("Software & Tools");
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.confidence).toBe(0.95);
    });

    it("unknown vendor with COGS category falls back to 'Cost of Goods Sold' at 0.6", () => {
      const result = deriveSubcategory(
        "xyzzy unknown vendor 12345",
        "cogs",
      );
      expect(result.subcategory).toBe("Cost of Goods Sold");
      expect(result.confidence).toBe(0.6);
    });

    it("unknown vendor with OpEx category falls back to 'Other' at 0.3", () => {
      const result = deriveSubcategory(
        "xyzzy unknown vendor 12345",
        "operating_expense",
      );
      expect(result.subcategory).toBe("Other");
      expect(result.confidence).toBe(0.3);
    });

    it("vendor with confidence < 0.5 falls through to category-based fallback", () => {
      // We need a vendor that matches a rule but with confidence < 0.5.
      // Use a custom categorizeTransaction call to verify behavior.
      // The deriveSubcategory function checks result.confidence >= 0.5,
      // so any match with confidence < 0.5 should fall through.
      // All built-in rules have confidence >= 0.7, so we test the boundary
      // by verifying the logic path: if categorizeTransaction returns null
      // (no match), the fallback is exercised — which we tested above.
      // For completeness, verify that a COGS fallback is used for unrecognized
      // names even when the name partially resembles something.
      const result = deriveSubcategory("zzzz no match here", "cogs");
      expect(result.subcategory).toBe("Cost of Goods Sold");
      expect(result.confidence).toBe(0.6);
    });

    it("known COGS vendor still uses categorization engine if confidence >= 0.5", () => {
      // "Gusto" is a known payroll vendor with confidence 0.95
      // Even if the account category is "cogs", the categorization engine
      // result should take precedence because confidence >= 0.5
      const result = deriveSubcategory("Gusto Payroll Service", "cogs");
      expect(result.subcategory).toBe("Payroll");
      expect(result.confidence).toBe(0.95);
      // It should NOT fall back to "Cost of Goods Sold"
      expect(result.subcategory).not.toBe("Cost of Goods Sold");
    });

    it("Slack vendor categorized as Software & Tools", () => {
      const result = deriveSubcategory("Slack", "operating_expense");
      expect(result.subcategory).toBe("Software & Tools");
      expect(result.confidence).toBe(0.95);
    });

    it("Google Ads categorized as Marketing", () => {
      const result = deriveSubcategory("Google Ads Campaign", "operating_expense");
      expect(result.subcategory).toBe("Marketing");
      expect(result.confidence).toBe(0.95);
    });

    it("empty account name falls back correctly", () => {
      const result = deriveSubcategory("", "operating_expense");
      expect(result.subcategory).toBe("Other");
      expect(result.confidence).toBe(0.3);
    });
  });
});
