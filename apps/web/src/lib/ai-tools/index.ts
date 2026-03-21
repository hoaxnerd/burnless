/**
 * AI tool registry — merges all domain-specific tool modules into a single
 * executeToolCall entry point. Drop-in replacement for ai-tool-executor.ts.
 */

import { db } from "@burnless/db";
import { aiToolAuditLogs } from "@burnless/db";
import { z } from "zod";
import type { ToolContext, ToolHandler } from "./types";

import { scenarioSchemas, scenarioHandlers } from "./scenarios";
import { headcountSchemas, headcountHandlers } from "./headcount";
import { revenueSchemas, revenueHandlers } from "./revenue";
import { forecastingSchemas, forecastingHandlers } from "./forecasting";
import { analyticsSchemas, analyticsHandlers } from "./analytics";
import { webSearchSchemas, webSearchHandlers } from "./web-search";

// ── Merged registries ────────────────────────────────────────────────────────

const toolSchemas: Record<string, z.ZodType> = {
  ...scenarioSchemas,
  ...headcountSchemas,
  ...revenueSchemas,
  ...forecastingSchemas,
  ...analyticsSchemas,
  ...webSearchSchemas,
};

const toolHandlers: Record<string, ToolHandler> = {
  ...scenarioHandlers,
  ...headcountHandlers,
  ...revenueHandlers,
  ...forecastingHandlers,
  ...analyticsHandlers,
  ...webSearchHandlers,
};

// ── Validation ───────────────────────────────────────────────────────────────

function validateToolInput(toolName: string, input: Record<string, unknown>): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const schema = toolSchemas[toolName];
  if (!schema) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    ).join("; ");
    return { success: false, error: `Invalid input for ${toolName}: ${issues}` };
  }
  return { success: true, data: result.data as Record<string, unknown> };
}

// ── Audit logging ────────────────────────────────────────────────────────────

function logToolAudit(
  context: ToolContext,
  toolName: string,
  input: Record<string, unknown>,
  status: "success" | "error" | "validation_error",
  result: unknown,
  durationMs: number
) {
  db.insert(aiToolAuditLogs)
    .values({
      companyId: context.companyId,
      userId: context.userId,
      conversationId: context.conversationId ?? null,
      toolName,
      input,
      status,
      result: result as Record<string, unknown>,
      durationMs,
    })
    .catch((err) => {
      console.warn("[ai-tool-audit] Failed to log tool call:", err instanceof Error ? err.message : err);
    });
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Execute a tool call and return a string result for the AI. */
export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const startTime = performance.now();

  // Validate input before execution
  const validation = validateToolInput(toolName, input);
  if (!validation.success) {
    const errorResult = { error: validation.error };
    logToolAudit(context, toolName, input, "validation_error", errorResult, Math.round(performance.now() - startTime));
    return JSON.stringify(errorResult);
  }
  const data = validation.data;

  const handler = toolHandlers[toolName];
  if (!handler) {
    const errorResult = { error: `Unknown tool: ${toolName}` };
    logToolAudit(context, toolName, input, "error", errorResult, Math.round(performance.now() - startTime));
    return JSON.stringify(errorResult);
  }

  let result: string;
  try {
    result = await handler(data, context);
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg = err instanceof Error ? err.message : String(err);
    logToolAudit(context, toolName, input, "error", { error: errorMsg }, durationMs);
    return JSON.stringify({ error: `Tool execution failed: ${errorMsg}` });
  }

  const durationMs = Math.round(performance.now() - startTime);
  let parsedResult: unknown;
  try {
    parsedResult = JSON.parse(result);
  } catch {
    parsedResult = { raw: result };
  }
  logToolAudit(context, toolName, input, "success", parsedResult, durationMs);

  return result;
}

// Re-export types for consumers
export type { ToolContext } from "./types";
