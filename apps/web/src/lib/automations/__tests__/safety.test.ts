// apps/web/src/lib/automations/__tests__/safety.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  getSafetyLimits,
  computeNextRunAt,
  isMissed,
  shouldAutoDisable,
} from "../safety";

const at = (iso: string) => new Date(iso);

// Top-level cleanup so env overrides set in one test never leak into another
// (getSafetyLimits reads process.env at call time).
beforeEach(() => {
  delete process.env.BURNLESS_JOB_MAX_PER_COMPANY;
  delete process.env.BURNLESS_JOB_AUTO_DISABLE_AFTER;
  delete process.env.BURNLESS_JOB_RUN_TIMEOUT_MS;
});

describe("getSafetyLimits", () => {
  beforeEach(() => {
    delete process.env.BURNLESS_JOB_MAX_PER_COMPANY;
    delete process.env.BURNLESS_JOB_AUTO_DISABLE_AFTER;
    delete process.env.BURNLESS_JOB_RUN_TIMEOUT_MS;
  });
  it("has sane defaults (both editions — no edition gate)", () => {
    const l = getSafetyLimits();
    expect(l.maxJobsPerCompany).toBe(25);
    expect(l.autoDisableAfter).toBe(3); // matches the mockup copy "auto-disabled after 3 fails"
    expect(l.runTimeoutMs).toBe(120_000);
    expect(l.dryRunTimeoutMs).toBe(60_000);
    expect(l.maxToolCalls).toBe(10);
  });
  it("honors env overrides", () => {
    process.env.BURNLESS_JOB_MAX_PER_COMPANY = "5";
    process.env.BURNLESS_JOB_AUTO_DISABLE_AFTER = "2";
    process.env.BURNLESS_JOB_RUN_TIMEOUT_MS = "30000";
    const l = getSafetyLimits();
    expect(l.maxJobsPerCompany).toBe(5);
    expect(l.autoDisableAfter).toBe(2);
    expect(l.runTimeoutMs).toBe(30_000);
  });
});

describe("computeNextRunAt", () => {
  it("returns the next minute matching the cron, strictly after `from`", () => {
    // Mon 09:00 weekly; from a Sunday → next Monday 09:00
    const next = computeNextRunAt("0 9 * * 1", at("2026-06-14T10:00:00Z")); // 2026-06-14 = Sunday
    expect(next?.toISOString()).toBe("2026-06-15T09:00:00.000Z"); // 2026-06-15 = Monday
  });
  it("daily 08:00 from mid-day rolls to next day", () => {
    const next = computeNextRunAt("0 8 * * *", at("2026-06-12T12:00:00Z"));
    expect(next?.toISOString()).toBe("2026-06-13T08:00:00.000Z");
  });
  it("returns null for an unmatchable/garbage cron (bounded scan gives up)", () => {
    expect(computeNextRunAt("bogus", at("2026-06-12T00:00:00Z"))).toBeNull();
  });
  it("computeNextRunAt respects the timezone", () => {
    // next 09:00 Asia/Kolkata after 2026-06-21T00:00Z → 03:30Z same day
    const next = computeNextRunAt("0 9 * * *", at("2026-06-21T00:00:00Z"), "Asia/Kolkata");
    expect(next?.toISOString()).toBe("2026-06-21T03:30:00.000Z");
  });
  it("computeNextRunAt UTC default is unchanged", () => {
    const next = computeNextRunAt("0 9 * * 1", at("2026-06-14T10:00:00Z")); // Sunday
    expect(next?.getUTCDay()).toBe(1);
  });
});

describe("isMissed", () => {
  it("flags a nextRunAt overdue beyond the missed threshold", () => {
    expect(isMissed(at("2026-06-12T00:00:00Z"), at("2026-06-12T00:01:00Z"))).toBe(false); // 60s — on time
    expect(isMissed(at("2026-06-12T00:00:00Z"), at("2026-06-12T01:00:00Z"))).toBe(true); // 1h late
  });
});

describe("shouldAutoDisable", () => {
  it("trips at the threshold", () => {
    expect(shouldAutoDisable(2)).toBe(false);
    expect(shouldAutoDisable(3)).toBe(true);
  });
});
