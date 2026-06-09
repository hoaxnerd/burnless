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
const LIB_DIR = path.resolve(import.meta.dirname, "../lib");

const FORECAST_WRITE_ROUTES = [
  "forecast-lines/route.ts", // POST
  "forecast-lines/[id]/route.ts", // PATCH
];

// The AI-tool create/update path persists forecast lines too (Phase 4 §4.5),
// so it must validate `custom_formula` expressions at its own boundary.
const AI_TOOL_FORECAST_PATH = "ai-tools/forecasting.ts";

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

  it("AI-tool forecast-line create/update references a formula validator (Phase 4 §4.5)", () => {
    const src = readFileSync(path.join(LIB_DIR, AI_TOOL_FORECAST_PATH), "utf8");
    const validated = VALIDATOR_TOKENS.some((t) => src.includes(t));

    expect(
      validated,
      `apps/web/src/lib/${AI_TOOL_FORECAST_PATH}: persists forecast-line parameters ` +
        `via create_forecast_line/update_forecast_line with NO boundary validation ` +
        `(no validateFormula / validateForecastParams / validateExpenseParams)`
    ).toBe(true);
  });
});
