import { describe, it, expect } from "vitest";
import { parseYearMonth, parseDateRange, parseISODate } from "../date-validation";

describe("parseYearMonth", () => {
  it("accepts valid YYYY-MM strings", () => {
    expect(parseYearMonth("2026-01")).toEqual({ year: 2026, month: 1 });
    expect(parseYearMonth("2026-12")).toEqual({ year: 2026, month: 12 });
    expect(parseYearMonth("1900-06")).toEqual({ year: 1900, month: 6 });
    expect(parseYearMonth("2100-01")).toEqual({ year: 2100, month: 1 });
  });

  it("rejects invalid formats", () => {
    expect(parseYearMonth("2026")).toBeNull();
    expect(parseYearMonth("2026-1")).toBeNull();
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth("2026-00")).toBeNull();
    expect(parseYearMonth("abc-01")).toBeNull();
    expect(parseYearMonth("")).toBeNull();
    expect(parseYearMonth("2026-01-01")).toBeNull();
  });

  it("rejects out-of-range years", () => {
    expect(parseYearMonth("1899-01")).toBeNull();
    expect(parseYearMonth("2101-01")).toBeNull();
  });
});

describe("parseDateRange", () => {
  it("returns Date objects for valid ranges", () => {
    const result = parseDateRange("2026-01", "2026-12");
    expect("periodStart" in result).toBe(true);
    if ("periodStart" in result) {
      expect(result.periodStart.getFullYear()).toBe(2026);
      expect(result.periodStart.getMonth()).toBe(0); // Jan
      expect(result.periodEnd.getFullYear()).toBe(2026);
      expect(result.periodEnd.getMonth()).toBe(11); // Dec
    }
  });

  it("accepts single-month ranges", () => {
    const result = parseDateRange("2026-06", "2026-06");
    expect("periodStart" in result).toBe(true);
  });

  it("rejects startDate after endDate", () => {
    const result = parseDateRange("2026-12", "2026-01");
    expect("error" in result).toBe(true);
  });

  it("rejects invalid startDate", () => {
    const result = parseDateRange("bad", "2026-12");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("startDate");
  });

  it("rejects invalid endDate", () => {
    const result = parseDateRange("2026-01", "bad");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("endDate");
  });

  it("rejects ranges exceeding 10 years", () => {
    const result = parseDateRange("2000-01", "2011-01");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("10 years");
  });

  it("accepts exactly 10 years", () => {
    const result = parseDateRange("2020-01", "2029-12");
    expect("periodStart" in result).toBe(true);
  });
});

describe("parseISODate", () => {
  it("accepts valid YYYY-MM-DD strings", () => {
    expect(parseISODate("2026-01-15")).toBeInstanceOf(Date);
    expect(parseISODate("2026-12-31")).toBeInstanceOf(Date);
  });

  it("rejects invalid formats", () => {
    expect(parseISODate("2026-01")).toBeNull();
    expect(parseISODate("2026")).toBeNull();
    expect(parseISODate("abc")).toBeNull();
    expect(parseISODate("2026-13-01")).toBeNull();
    expect(parseISODate("2026-01-32")).toBeNull();
    expect(parseISODate("2026-00-01")).toBeNull();
  });
});
