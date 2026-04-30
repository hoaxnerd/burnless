import { describe, expect, it } from "vitest";

import { autoMapColumns, COLUMN_PATTERNS, getAmountColumn } from "../import-utils";

describe("autoMapColumns Phase 1", () => {
  it("recognizes debit + credit pair", () => {
    const r = autoMapColumns(["Date", "Description", "Debit", "Credit"]);
    expect(typeof r.mapping.amount).toBe("object");
    expect((r.mapping.amount as { debit: string; credit: string }).debit).toBe("Debit");
    expect((r.mapping.amount as { debit: string; credit: string }).credit).toBe("Credit");
    // confidence.amount should reflect the stronger of the two pair matches
    expect(r.confidence.amount).toBeGreaterThanOrEqual(0.6);
  });

  it("recognizes single Amount column", () => {
    const r = autoMapColumns(["Date", "Description", "Amount"]);
    expect(r.mapping.amount).toBe("Amount");
    expect(r.confidence.amount).toBeGreaterThan(0);
  });

  it("recognizes Vendor / Merchant / Payee / Memo", () => {
    const r = autoMapColumns(["Date", "Amount", "Memo", "Vendor"]);
    expect(r.mapping.vendor).toBe("Vendor");
    expect(r.mapping.notes).toBe("Memo");
  });

  it("recognizes external_id reference column", () => {
    const r = autoMapColumns(["Date", "Amount", "Description", "Reference No"]);
    expect(r.mapping.externalId).toBe("Reference No");
  });

  it("does not consume debit/credit headers as single amount when paired", () => {
    const r = autoMapColumns(["Date", "Debit", "Credit"]);
    expect(typeof r.mapping.amount).toBe("object");
    // Single-column getter should report null for the polymorphic shape
    expect(getAmountColumn(r.mapping)).toBeNull();
  });

  it("falls back to single amount when only one of debit/credit is present", () => {
    // 'Debit' alone (no matching credit-like header) should NOT trigger pair
    // detection; the single-amount fallback regex still matches `debit` via
    // its broad pattern.
    const r = autoMapColumns(["Date", "Description", "Debit"]);
    expect(typeof r.mapping.amount).toBe("string");
  });

  it("preserves back-compat: getAmountColumn returns the string for single-column case", () => {
    const r = autoMapColumns(["Date", "Description", "Amount"]);
    expect(getAmountColumn(r.mapping)).toBe("Amount");
  });

  it("exposes new optional slots in MappingConfidence", () => {
    const r = autoMapColumns(["Date", "Amount", "Memo", "Vendor", "Reference No"]);
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
