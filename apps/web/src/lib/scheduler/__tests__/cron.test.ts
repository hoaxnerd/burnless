// apps/web/src/lib/scheduler/__tests__/cron.test.ts
import { describe, it, expect } from "vitest";
import { cronMatches } from "../cron";

// All comparisons are in UTC (matches scripts/cron-worker.ts semantics).
const at = (iso: string) => new Date(iso);

describe("cronMatches timezone", () => {
  it("UTC default is unchanged", () => {
    expect(cronMatches("30 14 * * *", at("2026-06-21T14:30:00Z"))).toBe(true);
    expect(cronMatches("30 14 * * *", at("2026-06-21T15:30:00Z"))).toBe(false);
  });
  it("matches against the job's timezone wall clock", () => {
    // 09:00 in Asia/Kolkata (UTC+5:30) === 03:30 UTC
    expect(cronMatches("0 9 * * *", at("2026-06-21T03:30:00Z"), "Asia/Kolkata")).toBe(true);
    expect(cronMatches("0 9 * * *", at("2026-06-21T09:00:00Z"), "Asia/Kolkata")).toBe(false);
  });
  it("is DST-correct for a US zone", () => {
    // 09:00 America/New_York in June is EDT (UTC-4) === 13:00 UTC
    expect(cronMatches("0 9 * * *", at("2026-06-21T13:00:00Z"), "America/New_York")).toBe(true);
    // In January it is EST (UTC-5) === 14:00 UTC
    expect(cronMatches("0 9 * * *", at("2026-01-21T14:00:00Z"), "America/New_York")).toBe(true);
  });
  it("day-of-week is read in the zone (0/7 = Sunday)", () => {
    // 2026-06-21 is a Sunday; 23:30 Kolkata is still Sunday though it's 18:00 UTC Sunday
    expect(cronMatches("0 9 * * 0", at("2026-06-21T03:30:00Z"), "Asia/Kolkata")).toBe(true);
  });
});

describe("cronMatches", () => {
  it("matches the wildcard every minute", () => {
    expect(cronMatches("* * * * *", at("2026-06-12T03:07:00Z"))).toBe(true);
  });
  it("matches a fixed minute+hour (data-retention 03:00)", () => {
    expect(cronMatches("0 3 * * *", at("2026-06-12T03:00:00Z"))).toBe(true);
    expect(cronMatches("0 3 * * *", at("2026-06-12T03:01:00Z"))).toBe(false);
    expect(cronMatches("0 3 * * *", at("2026-06-12T04:00:00Z"))).toBe(false);
  });
  it("matches weekly digest (Mon 08:00) — getUTCDay Monday = 1", () => {
    expect(cronMatches("0 8 * * 1", at("2026-06-15T08:00:00Z"))).toBe(true); // 2026-06-15 is a Monday
    expect(cronMatches("0 8 * * 1", at("2026-06-16T08:00:00Z"))).toBe(false); // Tuesday
  });
  it("matches step values */5", () => {
    expect(cronMatches("*/5 * * * *", at("2026-06-12T03:05:00Z"))).toBe(true);
    expect(cronMatches("*/5 * * * *", at("2026-06-12T03:07:00Z"))).toBe(false);
  });
  it("matches ranges and lists", () => {
    expect(cronMatches("0 9-17 * * *", at("2026-06-12T13:00:00Z"))).toBe(true);
    expect(cronMatches("0 9-17 * * *", at("2026-06-12T18:00:00Z"))).toBe(false);
    expect(cronMatches("0 8 * * 1,3,5", at("2026-06-17T08:00:00Z"))).toBe(true); // Wed
  });
  it("returns false for a malformed expression (not 5 fields)", () => {
    expect(cronMatches("0 3 * *", at("2026-06-12T03:00:00Z"))).toBe(false);
  });
});
