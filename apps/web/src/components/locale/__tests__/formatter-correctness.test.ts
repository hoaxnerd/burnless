import { describe, it, expect } from "vitest";
import { formatCurrency, formatCompactAmount } from "@burnless/types";

describe("formatCurrency", () => {
  it("formats USD with symbol and 0 default decimals", () => {
    expect(formatCurrency(1234, "USD", "en-US")).toMatch(/^\$1,234$/);
  });

  it("formats EUR with de-DE locale", () => {
    expect(formatCurrency(1234.56, "EUR", "de-DE")).toContain("€");
  });

  it("formats JPY with 0 decimals even when decimals option omitted", () => {
    const out = formatCurrency(1234.56, "JPY", "ja-JP");
    expect(out).not.toMatch(/\./);
  });

  it("formats INR with en-IN locale (Indian grouping)", () => {
    const out = formatCurrency(1234567, "INR", "en-IN");
    // en-IN groups as 12,34,567 not 1,234,567
    expect(out).toContain("12,34,567");
  });

  it("honors compact option", () => {
    expect(formatCurrency(1_500_000, "USD", "en-US", { compact: true })).toMatch(/1\.5M/);
  });
});

describe("formatCompactAmount", () => {
  it("USD: 1.5M / 340k / 42", () => {
    expect(formatCompactAmount(1_500_000, "USD", "en-US")).toBe("$1.5M");
    expect(formatCompactAmount(340_000, "USD", "en-US")).toBe("$340k");
    expect(formatCompactAmount(42, "USD", "en-US")).toBe("$42");
  });

  it("INR: crores / lakhs / k", () => {
    expect(formatCompactAmount(15_000_000, "INR", "en-IN")).toBe("₹1.5Cr");
    expect(formatCompactAmount(250_000, "INR", "en-IN")).toBe("₹2.5L");
  });

  it("JPY: M / k", () => {
    expect(formatCompactAmount(1_500_000, "JPY", "ja-JP")).toBe("¥1.5M");
  });

  it("signed negatives", () => {
    expect(formatCompactAmount(-1_500_000, "USD", "en-US")).toBe("-$1.5M");
  });
});
