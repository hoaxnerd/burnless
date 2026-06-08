/**
 * Guard test [VAL-02; EXP-01] — formula validation must reject dangerous /
 * syntactically-broken custom_formula expressions, and accept valid ones.
 *
 * RED-phase note: the *engine* `validateFormula` may already reject the
 * disallowed-keyword case and `evaluateFormula` may already surface a syntax
 * error. The real production gap (EXP-01) is that neither is wired into the
 * forecast-line save path (server route + client param validator) — that
 * boundary wiring is covered by lane B. This file pins the engine-level
 * contract that the wiring depends on: the validator/evaluator MUST be able to
 * tell a blocked or broken formula apart from a good one.
 */

import { describe, it, expect } from "vitest";
import { validateFormula, evaluateFormula } from "../formula";

describe("validateFormula / evaluateFormula — blocked + invalid formulas (VAL-02, EXP-01)", () => {
  it("rejects a disallowed-keyword expression ('process.exit(1)')", () => {
    const err = validateFormula("process.exit(1)");
    expect(
      err,
      `validateFormula('process.exit(1)') should return a disallowed-keyword error, got: ${String(err)}`
    ).toBeDefined();
    expect(err).toMatch(/disallowed|keyword|not allowed/i);
  });

  it("rejects a syntactically invalid expression ('1000 + * 2')", () => {
    // validateFormula does only a coarse token/keyword check, so a pure mathjs
    // syntax error like '1000 + * 2' must be caught by evaluateFormula, which
    // returns an error string instead of a value. The save path needs BOTH
    // checks to reject this input; here we assert at least one of them flags it.
    const preErr = validateFormula("1000 + * 2");
    const evalRes = evaluateFormula("1000 + * 2", {});

    const rejected = Boolean(preErr) || Boolean(evalRes.error);
    expect(
      rejected,
      `'1000 + * 2' must be rejected by validateFormula OR evaluateFormula; ` +
        `validateFormula=${String(preErr)}, evaluateFormula=${JSON.stringify(evalRes)}`
    ).toBe(true);
  });

  it("accepts a valid arithmetic expression ('1000 + 500')", () => {
    const err = validateFormula("1000 + 500");
    expect(
      err,
      `validateFormula('1000 + 500') should be undefined (valid), got: ${String(err)}`
    ).toBeUndefined();

    const res = evaluateFormula("1000 + 500", {});
    expect(res.error, `evaluateFormula error: ${String(res.error)}`).toBeUndefined();
    expect(res.value).toBe(1500);
  });
});
