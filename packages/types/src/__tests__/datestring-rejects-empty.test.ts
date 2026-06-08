import { describe, it, expect } from "vitest";
import { dateString, nullableDateString } from "../api/validators";

/**
 * Guard for VAL-01 / DATE-01 (systemic) and TEAM-04 (QA finding).
 *
 * Contract: the shared date validators in @burnless/types MUST reject empty
 * strings and unparseable garbage at the Zod boundary (success:false), so the
 * route returns a clean 400 instead of writing an `Invalid Date` to Postgres
 * and surfacing a generic 500.
 *
 * Current (buggy) impl: `dateString()` = `z.string().transform(s => new Date(s))`
 * — NO `.min(1)`, NO post-transform NaN guard. `new Date('')` and
 * `new Date('not-a-date')` are `Invalid Date` but Zod parse SUCCEEDS, so these
 * assertions FAIL RED until the helper is hardened
 * (e.g. `.min(1).refine(s => !isNaN(Date.parse(s)))`).
 */
describe("VAL-01/DATE-01: shared date validators reject empty/garbage strings", () => {
  describe("dateString()", () => {
    it("rejects an empty string", () => {
      const result = dateString().safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects an unparseable garbage string", () => {
      const result = dateString().safeParse("not-a-date");
      expect(result.success).toBe(false);
    });

    it("still accepts a valid ISO date string", () => {
      const result = dateString().safeParse("2026-06-08");
      expect(result.success).toBe(true);
    });
  });

  describe("nullableDateString()", () => {
    it("rejects an empty string", () => {
      // null is allowed (means "cleared"); an empty STRING is garbage and must reject.
      const result = nullableDateString().safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects an unparseable garbage string", () => {
      const result = nullableDateString().safeParse("not-a-date");
      expect(result.success).toBe(false);
    });

    it("still accepts null and a valid ISO date string", () => {
      expect(nullableDateString().safeParse(null).success).toBe(true);
      expect(nullableDateString().safeParse("2026-06-08").success).toBe(true);
    });
  });
});
