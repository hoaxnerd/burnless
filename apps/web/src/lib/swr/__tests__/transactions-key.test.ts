import { describe, it, expect } from "vitest";
import { KEYS } from "../keys";

describe("KEYS.transactions", () => {
  it("returns the bare path with no filters (back-compat)", () => {
    expect(KEYS.transactions()).toBe("/api/transactions");
    expect(KEYS.transactions({})).toBe("/api/transactions");
  });

  it("encodes accountId/startDate/endDate/limit as query params", () => {
    const key = KEYS.transactions({ accountId: "acc-1", startDate: "2026-01-01", endDate: "2026-02-01", limit: 100 });
    expect(key).toContain("accountId=acc-1");
    expect(key).toContain("startDate=2026-01-01");
    expect(key).toContain("endDate=2026-02-01");
    expect(key).toContain("limit=100");
    expect(key.startsWith("/api/transactions?")).toBe(true);
  });

  it("omits empty/undefined filter values", () => {
    expect(KEYS.transactions({ accountId: "acc-1", startDate: "" })).toBe("/api/transactions?accountId=acc-1");
  });
});
