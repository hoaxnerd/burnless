import { describe, expect, it } from "vitest";

import {
  autoMapColumns,
  COLUMN_PATTERNS,
  getAmountColumn,
  parseAmountCell,
  resolveAmount,
  type ColumnMapping,
} from "../import-utils";

/** Helper: call autoMapColumns in transaction mode and narrow the return type. */
function txMap(headers: string[]) {
  const r = autoMapColumns(headers);
  return { mapping: r.mapping as ColumnMapping, confidence: r.confidence };
}

describe("autoMapColumns Phase 1", () => {
  it("recognizes debit + credit pair", () => {
    const r = txMap(["Date", "Description", "Debit", "Credit"]);
    expect(typeof r.mapping.amount).toBe("object");
    expect((r.mapping.amount as { debit: string; credit: string }).debit).toBe("Debit");
    expect((r.mapping.amount as { debit: string; credit: string }).credit).toBe("Credit");
    // confidence.amount should reflect the stronger of the two pair matches
    expect(r.confidence.amount).toBeGreaterThanOrEqual(0.6);
  });

  it("recognizes single Amount column", () => {
    const r = txMap(["Date", "Description", "Amount"]);
    expect(r.mapping.amount).toBe("Amount");
    expect(r.confidence.amount).toBeGreaterThan(0);
  });

  it("recognizes Vendor / Merchant / Payee / Memo", () => {
    const r = txMap(["Date", "Amount", "Memo", "Vendor"]);
    expect(r.mapping.vendor).toBe("Vendor");
    expect(r.mapping.notes).toBe("Memo");
  });

  it("recognizes external_id reference column", () => {
    const r = txMap(["Date", "Amount", "Description", "Reference No"]);
    expect(r.mapping.externalId).toBe("Reference No");
  });

  it("does not consume debit/credit headers as single amount when paired", () => {
    const r = txMap(["Date", "Debit", "Credit"]);
    expect(typeof r.mapping.amount).toBe("object");
    // Single-column getter should report null for the polymorphic shape
    expect(getAmountColumn(r.mapping)).toBeNull();
  });

  it("falls back to single amount when only one of debit/credit is present", () => {
    // 'Debit' alone (no matching credit-like header) should NOT trigger pair
    // detection; the single-amount fallback regex still matches `debit` via
    // its broad pattern.
    const r = txMap(["Date", "Description", "Debit"]);
    expect(typeof r.mapping.amount).toBe("string");
  });

  it("preserves back-compat: getAmountColumn returns the string for single-column case", () => {
    const r = txMap(["Date", "Description", "Amount"]);
    expect(getAmountColumn(r.mapping)).toBe("Amount");
  });

  it("exposes new optional slots in MappingConfidence", () => {
    const r = txMap(["Date", "Amount", "Memo", "Vendor", "Reference No"]);
    expect(r.confidence.vendor).toBeGreaterThan(0);
    expect(r.confidence.notes).toBeGreaterThan(0);
    expect(r.confidence.externalId).toBeGreaterThan(0);
  });

  it("COLUMN_PATTERNS exposes new categories", () => {
    expect(COLUMN_PATTERNS.debit).toBeDefined();
    expect(COLUMN_PATTERNS.credit).toBeDefined();
    expect(COLUMN_PATTERNS.vendor).toBeDefined();
    expect(COLUMN_PATTERNS.notes).toBeDefined();
    expect(COLUMN_PATTERNS.externalId).toBeDefined();
  });
});

describe("resolveAmount Phase 1", () => {
  it("parses a single-column amount", () => {
    expect(resolveAmount({ Amount: "123.45" }, "Amount")).toBeCloseTo(123.45);
  });

  it("returns 0 for missing single-column value", () => {
    expect(resolveAmount({}, "Amount")).toBe(0);
    expect(resolveAmount({ Amount: "" }, "Amount")).toBe(0);
  });

  it("synthesizes credit − debit for polymorphic mapping", () => {
    expect(
      resolveAmount({ Debit: "10.00", Credit: "100.00" }, { debit: "Debit", credit: "Credit" }),
    ).toBeCloseTo(90);
  });

  it("treats missing debit/credit cells as 0 in synthesis", () => {
    expect(
      resolveAmount({ Credit: "50.00" }, { debit: "Debit", credit: "Credit" }),
    ).toBeCloseTo(50);
    expect(
      resolveAmount({ Debit: "30.00" }, { debit: "Debit", credit: "Credit" }),
    ).toBeCloseTo(-30);
    expect(
      resolveAmount({}, { debit: "Debit", credit: "Credit" }),
    ).toBe(0);
  });

  it("strips currency glyphs and parens", () => {
    expect(parseAmountCell("$1,234.56")).toBeCloseTo(1234.56);
    expect(parseAmountCell("(99.99)")).toBeCloseTo(-99.99);
    expect(parseAmountCell("€42")).toBeCloseTo(42);
    expect(parseAmountCell(undefined)).toBe(0);
  });
});
