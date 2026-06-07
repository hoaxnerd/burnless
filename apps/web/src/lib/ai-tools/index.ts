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
  MUTATION_TOOL_NAMES,
} from "@burnless/ai";
import { forecastingSchemas, forecastingHandlers } from "./forecasting";
import { analyticsSchemas, analyticsHandlers } from "./analytics";
import { webSearchSchemas, webSearchHandlers } from "./web-search";
import { webScrapingSchemas, webScrapingHandlers } from "./web-scraping";
import { genuiDisplaySchemas, genuiDisplayHandlers } from "./genui-display";

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
  ...genuiDisplaySchemas,
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
  ...genuiDisplayHandlers,
};

// ── Mutation tagging (for guardrail enforcement) ────────────────────────────

/** Tools that create, update, or delete data. Single source of truth: the
 *  permission layer's MUTATION_TOOL_NAMES (WRITE_TOOLS ∪ DELETE_TOOLS). Deriving
 *  it here keeps the diff-gate, cache invalidation, and permission resolver from
 *  drifting (spec §4.4 "unify the two mutation sets"). */
const MUTATION_TOOLS: ReadonlySet<string> = MUTATION_TOOL_NAMES;

function isMutationTool(toolName: string): boolean {
  return MUTATION_TOOLS.has(toolName);
}

/** Mutation tools that DON'T route through the scenario-mutate facade — they
 *  write non-overridable tables directly (scenario CRUD writes `scenarios`;
 *  investor writes `fundingRoundInvestors`) and ignore ctx.mode. They cannot be
 *  previewed as a scenario-override diff, so plan mode must not run them (it would
 *  write while auditing pending_apply). See worklog Plan 3 / carry-over follow-up a. */
const NON_FACADE_MUTATION_TOOLS: ReadonlySet<string> = new Set<string>([
  "create_scenario",
  "update_scenario",
  "delete_scenario",
  "create_funding_round_investor",
]);

/** A mutation whose plan mode yields a real scenario-override delta (diff-gate). */
function isDiffableMutationTool(toolName: string): boolean {
  return isMutationTool(toolName) && !NON_FACADE_MUTATION_TOOLS.has(toolName);
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
  status: "success" | "error" | "validation_error" | "pending_apply",
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
      permissionDecision: context.permissionDecision ?? "auto",
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

  // Plan-mode safety (worklog Plan 3): a non-facade mutation cannot be previewed
  // as a scenario-override delta and would WRITE if its handler ran. In plan mode,
  // skip execution entirely and return an empty plan envelope so the diff-gate
  // shows no diff (plain permission card); the real write happens on Apply (commit).
  if (context.mode === "plan" && isMutationTool(toolName) && !isDiffableMutationTool(toolName)) {
    const planned = JSON.stringify({ planned: true, overrides: [] });
    logToolAudit(context, toolName, input, "pending_apply", { planned: true, overrides: [] }, Math.round(performance.now() - startTime));
    return planned;
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

  const isPlan = context.mode === "plan";

  // Plan mode previews the write — never invalidate caches (nothing was committed).
  if (!isPlan && isMutationTool(toolName)) {
    invalidateCacheForTool(toolName);
  }

  const durationMs = Math.round(performance.now() - startTime);
  let parsedResult: unknown;
  try {
    parsedResult = JSON.parse(result);
  } catch {
    parsedResult = { raw: result };
  }
  logToolAudit(context, toolName, input, isPlan ? "pending_apply" : "success", parsedResult, durationMs);

  return result;
}

/** Human-readable description of a tool action, e.g. `create forecast line "AWS"`. */
export function describeToolAction(toolName: string, input: Record<string, unknown>): string {
  return describeMutation(toolName, input);
}

/** Record an audit row for a tool the user explicitly denied (never executed). */
export function logDeniedToolCall(
  context: ToolContext,
  toolName: string,
  input: Record<string, unknown>
): void {
  // NOTE: a declined tool has no dedicated audit status; "success" here means
  // "the decline was recorded without error". Disambiguate via permissionDecision:
  // "denied" in queries — do NOT treat status="success" alone as "tool ran".
  logToolAudit(
    { ...context, permissionDecision: "denied" },
    toolName,
    input,
    "success",
    { declined: true },
    0
  );
}

// Re-export types for consumers
export type { ToolContext } from "./types";

/** Internal handles exposed for regression guards only — not a public API. */
export const __testables = {
  MUTATION_TOOLS,
  MUTATION_CACHE_TAGS: MUTATION_CACHE_TAGS as Readonly<Record<string, string[]>>,
  NON_FACADE_MUTATION_TOOLS,
  isDiffableMutationTool,
};
