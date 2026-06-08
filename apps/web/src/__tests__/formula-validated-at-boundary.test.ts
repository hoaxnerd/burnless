import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * GUARD [VAL-02]: The forecast-lines write routes must validate the method
 * `parameters` (and specifically a `custom_formula` expression) at the API
 * boundary — by referencing the engine `validateFormula` and/or a method-
 * discriminated `validateForecastParams` / `validateExpenseParams` helper.
 *
 * Why: `parameters` is typed as an opaque `z.record(z.unknown())` bag, so a
 * `custom_formula` row with an empty / >1000-char / banned-keyword
 * (import/eval/process/__proto__) expression is accepted and durably persisted;
 * `validateFormula`'s keyword/length guards only fire LATER at compute time.
 * `validateFormula` (packages/engine/src/formula.ts) currently has ZERO callers
 * at any API write boundary, and the per-method validator (lib/expense-params.ts)
 * is dead code referenced only by its own test.
 *
 * RED NOW: the two forecast-line write routes reference none of these helpers.
 * When boundary validation is wired in, this turns GREEN.
 */

const API_DIR = path.resolve(import.meta.dirname, "../app/api");

const FORECAST_WRITE_ROUTES = [
  "forecast-lines/route.ts", // POST
  "forecast-lines/[id]/route.ts", // PATCH
];

// Any of these tokens proves boundary-level method/formula validation is wired.
const VALIDATOR_TOKENS = [
  "validateFormula",
  "validateForecastParams",
  "validateExpenseParams",
];

describe("forecast-line writes validate formula/params at the boundary (VAL-02)", () => {
  it("forecast-lines POST + [id] PATCH reference a formula/params validator", () => {
    const offenders: string[] = [];

    for (const rel of FORECAST_WRITE_ROUTES) {
      const src = readFileSync(path.join(API_DIR, rel), "utf8");
      const validated = VALIDATOR_TOKENS.some((t) => src.includes(t));
      if (!validated) {
        offenders.push(
          `apps/web/src/app/api/${rel}: persists forecast-line parameters with NO ` +
            `boundary validation (no validateFormula / validateForecastParams / validateExpenseParams)`
        );
      }
    }

    expect(
      offenders,
      `Forecast-line write routes missing boundary formula/param validation ` +
        `— ${offenders.length} found:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
