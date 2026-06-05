import { describe, it, expect } from "vitest";
import { previousMonthKey } from "../utils";

describe("previousMonthKey", () => {
  it("returns the prior month within a year", () => {
    expect(previousMonthKey("2026-06")).toBe("2026-05");
  });

  it("rolls back across a year boundary", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });
});
