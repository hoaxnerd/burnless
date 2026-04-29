import { describe, it, expect } from "vitest";
import { CURRENCY_CODES, CURRENCIES, isValidCurrency } from "../index";

describe("CURRENCY_CODES", () => {
  it("contains exactly the keys of CURRENCIES", () => {
    expect([...CURRENCY_CODES].sort()).toEqual(
      Object.keys(CURRENCIES).sort()
    );
  });

  it("every member passes isValidCurrency", () => {
    for (const code of CURRENCY_CODES) {
      expect(isValidCurrency(code)).toBe(true);
    }
  });

  it("is a readonly tuple (Zod-compatible)", () => {
    expect(CURRENCY_CODES.length).toBeGreaterThan(0);
    expect(Array.isArray(CURRENCY_CODES)).toBe(true);
  });
});
