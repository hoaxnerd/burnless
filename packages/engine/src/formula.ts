/**
 * Sandboxed formula evaluator built on mathjs.
 *
 * Replaces the old regex + `new Function()` evaluator with a proper math parser.
 * Supports:
 *  - Arithmetic: + - * / % ^
 *  - Functions: min, max, floor, ceil/ceiling, round, abs, sqrt, if(cond, then, else)
 *  - Variable references: flat names like `revenue` or dotted paths like `Revenue.Total`
 *  - Time offsets: `Revenue.Total[-1]` to reference N periods back
 *  - Constants: pi, e
 */

import { create, all, type MathJsInstance } from "mathjs";
import type { MonthlySeries } from "./utils";

// ── Allowed function whitelist ────────────────────────────────────────────────

export const ALLOWED_FUNCTIONS = new Set([
  "min",
  "max",
  "floor",
  "ceil",
  "round",
  "abs",
  "sqrt",
  "mod",
  "pow",
  "log",
  "log10",
  "exp",
]);

// ── Create a restricted mathjs instance ───────────────────────────────────────

function createSandboxedMath(): MathJsInstance {
  const math = create(all!, {
    number: "number",
  });

  // Remove dangerous functions that could access the runtime.
  // Keep "evaluate", "parse", "config", "typed" — needed internally by mathjs.
  const dangerous = [
    "import",
    "createUnit",
    "simplify",
    "derivative",
    "rationalize",
    "compile",
    "chain",
  ];
  for (const fn of dangerous) {
    try {
      // @ts-expect-error — we're intentionally deleting these
      delete math[fn];
    } catch {
      // Some may not exist, that's fine
    }
  }

  return math;
}

const math = createSandboxedMath();

// ── Types ─────────────────────────────────────────────────────────────────────

/** Context for resolving variable references and time offsets. */
export interface FormulaContext {
  /** Named constants / flat variables: { revenue: 50000, headcount: 12 } */
  variables?: Record<string, number>;
  /** All resolved forecast line series, keyed by line name (e.g. "Revenue.Total") */
  resolvedSeries?: Map<string, MonthlySeries>;
  /** Current month key (e.g. "2026-03") for resolving time offsets */
  currentMonthKey?: string;
  /** Ordered array of all month keys in the forecast period */
  allMonthKeys?: string[];
}

/** Result of formula evaluation. */
export interface FormulaResult {
  value: number;
  error?: string;
}

// ── Pre-validation ────────────────────────────────────────────────────────────

/** Pattern for valid tokens in a formula expression. */
const VALID_TOKEN_PATTERN =
  /^[\d\s+\-*/%^().,\[\]a-zA-Z_]+$/;

/**
 * Validate a formula expression before evaluation.
 * Returns an error string if invalid, undefined if valid.
 */
export function validateFormula(expression: string): string | undefined {
  if (!expression || expression.trim().length === 0) {
    return "Empty expression";
  }

  if (expression.length > 1000) {
    return "Expression too long (max 1000 characters)";
  }

  // Check for obviously dangerous patterns
  if (/\b(import|require|global|globalThis|process|eval|Function|__proto__|constructor)\b/i.test(expression)) {
    return "Expression contains disallowed keyword";
  }

  // Check for assignment operators
  if (/[^=!<>]=[^=]/.test(expression) && !/[<>!=]=[=]?/.test(expression)) {
    // Allow ==, !=, <=, >= but disallow bare =
    // More precise: check for = not preceded by < > ! = and not followed by =
    const stripped = expression.replace(/[<>!=]=/g, "").replace(/==/g, "");
    if (/=/.test(stripped)) {
      return "Assignment not allowed in formulas";
    }
  }

  return undefined;
}

// ── Time offset resolution ────────────────────────────────────────────────────

/**
 * Resolve `VarName[-N]` patterns by replacing them with the actual value
 * from N periods back in the resolved series.
 */
function resolveTimeOffsets(
  expression: string,
  ctx: FormulaContext
): string {
  if (!ctx.resolvedSeries || !ctx.currentMonthKey || !ctx.allMonthKeys) {
    return expression;
  }

  // Match patterns like `Revenue.Total[-1]` or `Headcount.Sales.Total[-3]`
  const offsetPattern = /([a-zA-Z_][a-zA-Z0-9_.]*)\[(-?\d+)\]/g;
  const monthKeys = ctx.allMonthKeys;
  const currentIdx = monthKeys.indexOf(ctx.currentMonthKey);

  return expression.replace(offsetPattern, (match, varName: string, offsetStr: string) => {
    const offset = parseInt(offsetStr, 10);
    const targetIdx = currentIdx + offset;

    if (targetIdx < 0 || targetIdx >= monthKeys.length) {
      return "0"; // Out of range — default to 0
    }

    const targetMonthKey = monthKeys[targetIdx]!;
    const series = ctx.resolvedSeries!.get(varName);
    if (!series) {
      return "0";
    }

    const value = series.get(targetMonthKey) ?? 0;
    return String(value);
  });
}

/**
 * Resolve `VarName` (dotted path, current period — no offset) references
 * from resolvedSeries when they aren't in the flat variables.
 */
function resolveDottedVars(
  expression: string,
  ctx: FormulaContext
): { expression: string; scope: Record<string, number> } {
  const scope: Record<string, number> = {};

  if (!ctx.resolvedSeries || !ctx.currentMonthKey) {
    return { expression, scope };
  }

  // Find all dotted variable references like Revenue.Total, Headcount.Engineering.Total
  // that aren't already part of a [...] offset reference (those are handled first)
  const dottedPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)\b(?!\[)/g;
  let match: RegExpExecArray | null;

  while ((match = dottedPattern.exec(expression)) !== null) {
    const varName = match[1]!;
    // Skip function names
    if (ALLOWED_FUNCTIONS.has(varName.toLowerCase())) continue;

    const series = ctx.resolvedSeries.get(varName);
    if (series) {
      const value = series.get(ctx.currentMonthKey) ?? 0;
      // Replace dots with underscores for mathjs scope (dots are member access in mathjs)
      const safeName = varName.replace(/\./g, "_");
      scope[safeName] = value;
      expression = expression.replace(new RegExp(escapeRegex(varName), "g"), safeName);
    }
  }

  return { expression, scope };
}

/**
 * Resolve flat (single-segment) identifiers like `CloudCosts` from resolvedSeries
 * at the current month. Skips function names, the `pi`/`e`/`month` reserved names,
 * and any key already supplied via `context.variables` (explicit vars win). Names
 * not present in resolvedSeries resolve to 0 (missing reference). (Phase 4 §4.2)
 */
function resolveFlatVars(
  expression: string,
  ctx: FormulaContext
): { scope: Record<string, number> } {
  const scope: Record<string, number> = {};

  if (!ctx.resolvedSeries || !ctx.currentMonthKey) {
    return { scope };
  }

  // Flat identifiers not immediately followed by `.`, `[`, or `(`
  // (those are dotted refs, offset refs, or function calls respectively).
  const flatPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b(?![.\[(])/g;
  const reserved = new Set(["pi", "e", "month"]);
  const declaredVars = new Set(Object.keys(ctx.variables ?? {}));

  let match: RegExpExecArray | null;
  while ((match = flatPattern.exec(expression)) !== null) {
    const name = match[1]!;
    if (ALLOWED_FUNCTIONS.has(name.toLowerCase())) continue;
    if (reserved.has(name.toLowerCase())) continue;
    if (declaredVars.has(name)) continue;
    if (name in scope) continue;

    scope[name] = ctx.resolvedSeries.get(name)?.get(ctx.currentMonthKey) ?? 0;
  }

  return { scope };
}

// ── Custom `if` function ──────────────────────────────────────────────────────

/**
 * if(condition, thenValue, elseValue)
 * condition is truthy if > 0
 */
function conditionalIf(condition: number, thenVal: number, elseVal: number): number {
  return condition > 0 ? thenVal : elseVal;
}

// ── Main evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate a formula expression in a sandboxed context.
 *
 * @param expression - The formula string (e.g. "floor(Revenue.Total / 20000) * 5000")
 * @param context - Variables, resolved series, and time context
 * @returns The numeric result, or 0 if evaluation fails
 */
export function evaluateFormula(
  expression: string,
  context: FormulaContext = {}
): FormulaResult {
  // Validate
  const validationError = validateFormula(expression);
  if (validationError) {
    return { value: 0, error: validationError };
  }

  try {
    // Step 1: Resolve time offsets (VarName[-N])
    let resolved = resolveTimeOffsets(expression, context);

    // Step 2: Resolve dotted variable references to current period values
    const { expression: withDotted, scope: dottedScope } = resolveDottedVars(resolved, context);
    resolved = withDotted;

    // Step 2b: Resolve flat single-segment identifiers from resolvedSeries
    const { scope: flatScope } = resolveFlatVars(resolved, context);

    // Step 3: Alias 'ceiling' → 'ceil' for user convenience
    resolved = resolved.replace(/\bceiling\b/gi, "ceil");

    // Step 4: Build scope with all variables.
    // Order matters: explicit/injected variables (incl. `month`) win over series.
    const scope: Record<string, number | ((...args: number[]) => number)> = {
      ...flatScope,
      ...dottedScope,
      ...context.variables,
      // Custom functions
      "if": conditionalIf as unknown as (...args: number[]) => number,
    };

    // Step 5: Evaluate with mathjs
    const result = math.evaluate(resolved, scope);

    // Step 6: Validate result
    if (typeof result === "number" && isFinite(result)) {
      return { value: result };
    }

    return { value: 0, error: "Expression did not produce a finite number" };
  } catch (err) {
    return {
      value: 0,
      error: err instanceof Error ? err.message : "Evaluation failed",
    };
  }
}

/**
 * Backward-compatible wrapper: evaluates a simple expression with flat variables.
 * Drop-in replacement for the old evaluateSimpleExpression().
 */
export function evaluateSimpleExpression(
  expr: string,
  vars: Record<string, number> = {}
): number {
  const result = evaluateFormula(expr, { variables: vars });
  return result.value;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
