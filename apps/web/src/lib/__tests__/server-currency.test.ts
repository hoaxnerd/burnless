import { describe, it, expect } from "vitest";
import { companyCurrency } from "../server-currency";

describe("companyCurrency (Phase 4 C)", () => {
  it("returns the company's currency when valid", () => {
    expect(companyCurrency({ currency: "EUR" })).toBe("EUR");
    expect(companyCurrency({ currency: "GBP" })).toBe("GBP");
    expect(companyCurrency({ currency: "INR" })).toBe("INR");
  });

  it("falls back to USD for invalid codes (pre-whitelist legacy rows)", () => {
    expect(companyCurrency({ currency: "XXX" })).toBe("USD");
    expect(companyCurrency({ currency: "" })).toBe("USD");
  });

  it("falls back to USD for null/undefined (defensive)", () => {
    expect(companyCurrency(null)).toBe("USD");
    expect(companyCurrency(undefined)).toBe("USD");
    expect(companyCurrency({})).toBe("USD");
  });
});
