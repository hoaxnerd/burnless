/**
 * AI tool registry — merges all domain-specific tool modules into a single
 * executeToolCall entry point. Drop-in replacement for ai-tool-executor.ts.
 */

import { db } from "@burnless/db";
import { aiToolAuditLogs } from "@burnless/db";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import type { ToolContext, ToolHandler } from "./types";

import { scenarioSchemas, scenarioHandlers } from "./scenarios";
import { headcountSchemas, headcountHandlers } from "./headcount";
import { revenueSchemas, revenueHandlers } from "./revenue";
import {
  createFundingRound,
  updateFundingRound,
  deleteFundingRound,
  addFundingRoundInvestor,
  markGrantMilestoneHit,
  modelDilution,
} from "./funding";
import {
  CreateFundingRoundSchema,
  UpdateFundingRoundSchema,
  DeleteFundingRoundSchema,
  AddFundingRoundInvestorSchema,
  MarkGrantMilestoneHitSchema,
  ModelDilutionSchema,
} from "@burnless/ai";
import { forecastingSchemas, forecastingHandlers } from "./forecasting";
import { analyticsSchemas, analyticsHandlers } from "./analytics";
import { webSearchSchemas, webSearchHandlers } from "./web-search";
import { webScrapingSchemas, webScrapingHandlers } from "./web-scraping";

// ── Merged registries ────────────────────────────────────────────────────────

const fundingSchemas: Record<string, z.ZodType> = {
  create_funding_round: CreateFundingRoundSchema,
  update_funding_round: UpdateFundingRoundSchema,
  delete_funding_round: DeleteFundingRoundSchema,
  create_funding_round_investor: AddFundingRoundInvestorSchema,
  update_grant_milestone: MarkGrantMilestoneHitSchema,
  get_dilution_projection: ModelDilutionSchema,
};

const fundingHandlers: Record<string, ToolHandler> = {
  create_funding_round: createFundingRound,
  update_funding_round: updateFundingRound,
  delete_funding_round: deleteFundingRound,
  create_funding_round_investor: addFundingRoundInvestor,
  update_grant_milestone: markGrantMilestoneHit,
  get_dilution_projection: modelDilution,
};

const toolSchemas: Record<string, z.ZodType> = {
  ...scenarioSchemas,
  ...headcountSchemas,
  ...revenueSchemas,
  ...fundingSchemas,
  ...forecastingSchemas,
  ...analyticsSchemas,
  ...webSearchSchemas,
  ...webScrapingSchemas,
};

const toolHandlers: Record<string, ToolHandler> = {
  ...scenarioHandlers,
  ...headcountHandlers,
  ...revenueHandlers,
  ...fundingHandlers,
  ...forecastingHandlers,
  ...analyticsHandlers,
  ...webSearchHandlers,
  ...webScrapingHandlers,
};

// ── Mutation tagging (for guardrail enforcement) ────────────────────────────

/** Tools that create, update, or delete data. Read-only tools are excluded. */
const MUTATION_TOOLS = new Set([
  // Create
  "create_scenario", "create_headcount", "create_department", "create_revenue_stream",
  "create_funding_round", "create_funding_round_investor", "update_grant_milestone",
  "create_forecast_line", "create_account",
  "create_salary_change", "create_bonus", "create_equity_grant",
  // Update
  "update_scenario", "update_headcount", "update_department", "update_revenue_stream",
  "update_funding_round", "update_forecast_line", "update_account",
  // Delete
  "delete_scenario", "delete_headcount", "delete_department", "delete_revenue_stream",
  "delete_funding_round", "delete_forecast_line", "delete_account",
]);

function isMutationTool(toolName: string): boolean {
  return MUTATION_TOOLS.has(toolName);
}

/** Maps mutation tool names to the cache tags they should invalidate.
 *  Scenario-override changes also invalidate "scenario-overrides" so the
 *  banner / diff views refresh. */
const MUTATION_CACHE_TAGS: Record<string, string[]> = {
  create_scenario: ["scenarios"],
  update_scenario: ["scenarios"],
  delete_scenario: ["scenarios"],
  create_headcount: ["headcount-plans", "scenario-overrides"],
  update_headcount: ["headcount-plans", "scenario-overrides"],
  delete_headcount: ["headcount-plans", "scenario-overrides"],
  create_salary_change: ["headcount-plans", "scenario-overrides"],
  create_bonus: ["headcount-plans", "scenario-overrides"],
  create_equity_grant: ["headcount-plans", "scenario-overrides"],
  create_department: ["departments", "scenario-overrides"],
  update_department: ["departments", "scenario-overrides"],
  delete_department: ["departments", "headcount-plans", "scenario-overrides"],
  create_revenue_stream: ["revenue-streams", "scenario-overrides"],
  update_revenue_stream: ["revenue-streams", "scenario-overrides"],
  delete_revenue_stream: ["revenue-streams", "scenario-overrides"],
  create_funding_round: ["funding-rounds", "scenario-overrides", "cap-table"],
  update_funding_round: ["funding-rounds", "scenario-overrides", "cap-table"],
  delete_funding_round: ["funding-rounds", "scenario-overrides", "cap-table"],
  create_funding_round_investor: ["funding-rounds", "cap-table"],
  update_grant_milestone: ["funding-rounds", "scenario-overrides", "cap-table"],
  create_forecast_line: ["forecast-lines", "scenario-overrides"],
  update_forecast_line: ["forecast-lines", "scenario-overrides"],
  delete_forecast_line: ["forecast-lines", "scenario-overrides"],
  create_account: ["accounts", "scenario-overrides"],
  update_account: ["accounts", "scenario-overrides"],
  delete_account: ["accounts", "scenario-overrides"],
};

function invalidateCacheForTool(toolName: string): void {
  const tags = MUTATION_CACHE_TAGS[toolName];
  if (tags) {
    for (const tag of tags) {
      revalidateTag(tag);
    }
  }
}

function describeMutation(toolName: string, input: Record<string, unknown>): string {
  const action = toolName.startsWith("create_") || toolName.startsWith("add_")
    ? "create"
    : toolName.startsWith("update_")
      ? "update"
      : "delete";
  const entity = toolName.replace(/^(create_|add_|update_|delete_)/, "").replace(/_/g, " ");
  const id = input.id as string | undefined;
  const name = (input.name ?? input.title) as string | undefined;
  const label = name ? ` "${name}"` : id ? ` (ID: ${id})` : "";
  return `${action} ${entity}${label}`;
}

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
  if (!context.companyId) {
    return;
  }
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

  // ── Guardrail enforcement ────────────────────────────────────────────────
  const writeMode = context.writeMode ?? "full";
  if (isMutationTool(toolName) && writeMode !== "full") {
    const description = describeMutation(toolName, data);

    if (writeMode === "read_only") {
      const blockedResult = {
        error: `Mutation blocked: AI write mode is set to "read_only". The user's settings prevent the AI from making changes to data. To ${description}, the user must change AI write mode to "full" or "confirm" in Settings > AI Features.`,
        blocked: true,
        action: description,
      };
      logToolAudit(context, toolName, input, "error", blockedResult, Math.round(performance.now() - startTime));
      return JSON.stringify(blockedResult);
    }

    if (writeMode === "confirm") {
      // Return a preview — the AI should present this to the user and ask for confirmation
      const previewResult = {
        requiresConfirmation: true,
        action: description,
        toolName,
        input: data,
        message: `I'd like to ${description}. This action requires your confirmation because AI write mode is set to "confirm". Please reply "yes" or "confirm" to proceed, or "no" to cancel.`,
      };
      logToolAudit(context, toolName, input, "success", previewResult, Math.round(performance.now() - startTime));
      return JSON.stringify(previewResult);
    }
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

  // Invalidate relevant caches after successful mutations so pages show fresh data
  if (isMutationTool(toolName)) {
    invalidateCacheForTool(toolName);
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
