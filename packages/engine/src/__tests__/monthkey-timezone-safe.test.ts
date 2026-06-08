/**
 * Guard test [DATE-02] — monthKey must be timezone-safe.
 *
 * Bug: `monthKey` calls `getFullYear()`/`getMonth()` (LOCAL time). A date built
 * from the ISO date-only string '2026-03-01' is parsed as UTC midnight; in a
 * negative-offset timezone (e.g. America/Los_Angeles, UTC-8) that local time is
 * 2026-02-28 16:00, so getMonth() returns 1 (February) and monthKey yields
 * '2026-02' instead of '2026-03'. This silently shifts every month bucket back
 * one month for users west of UTC.
 *
 * IMPORTANT: process.env.TZ is set at the very top BEFORE importing the module,
 * because the Date timezone is read at evaluation time. If your runner caches TZ
 * such that it can't be forced in-process, run this file with the env prefix:
 *   TZ=America/Los_Angeles pnpm --filter @burnless/engine vitest run \
 *     src/__tests__/monthkey-timezone-safe.test.ts
 */

// Force a negative-offset timezone BEFORE any date logic / module import.
process.env.TZ = "America/Los_Angeles";

import { describe, it, expect } from "vitest";
import { monthKey } from "../utils";

describe("monthKey — timezone safety (DATE-02)", () => {
  it("a date from the ISO string '2026-03-01' yields '2026-03' (not '2026-02')", () => {
    const out = monthKey("2026-03-01");
    expect(
      out,
      `monthKey('2026-03-01') === ${out}; running under TZ=${process.env.TZ}. ` +
        `If this is '2026-02', the helper read local-time month for a UTC date.`
    ).toBe("2026-03");
  });

  it("first-of-month ISO strings do not shift back a month in a negative-offset TZ", () => {
    const cases: Array<[string, string]> = [
      ["2026-01-01", "2026-01"],
      ["2026-03-01", "2026-03"],
      ["2026-12-01", "2026-12"],
    ];
    const offenders: string[] = [];
    for (const [input, expected] of cases) {
      const got = monthKey(input);
      if (got !== expected) offenders.push(`monthKey('${input}') => '${got}' (expected '${expected}')`);
    }
    expect(
      offenders,
      `Timezone-shifted month keys under TZ=${process.env.TZ}:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
