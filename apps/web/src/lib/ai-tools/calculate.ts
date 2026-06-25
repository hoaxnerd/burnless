/**
 * `calculate` — stateless arithmetic tool (spec §5, Workstream 2 Slice C).
 *
 * Wraps the engine's sandboxed mathjs evaluator so the AI does exact arithmetic
 * instead of hallucinating numbers. No company context, no DB, no scenario, no
 * mutation. Lives in the finance domain (registered via FINANCIAL_TOOLS); this
 * module supplies only the runtime handler + arg schema.
 */

import { z } from "zod";
import { evaluateFormula } from "@burnless/engine";
import type { ToolHandler } from "./types";

export const calculateSchema = z.object({
  expression: z.string().min(1, "Expression is required").max(1000, "Expression too long"),
});

/**
 * Evaluate `expression` and return `{ expression, result }`, or `{ error }` on
 * invalid/unsafe/malformed input. NEVER throws — the chat loop must not see an
 * exception. We use evaluateFormula (not evaluateSimpleExpression) because the
 * latter swallows the error and returns 0, which would make a real 0 result
 * indistinguishable from a failure.
 */
export const calculateHandler: ToolHandler = async (input) => {
  const parsed = calculateSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid expression" });
  }
  const { expression } = parsed.data;
  const { value, error } = evaluateFormula(expression);
  if (error) {
    return JSON.stringify({ error });
  }
  return JSON.stringify({ expression, result: value });
};

export const calculateSchemas: Record<string, z.ZodType> = {
  calculate: calculateSchema,
};

export const calculateHandlers: Record<string, ToolHandler> = {
  calculate: calculateHandler,
};
