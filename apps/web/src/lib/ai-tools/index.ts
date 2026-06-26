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
  getFinancialTools,
} from "@burnless/ai";
import type { ToolDefinition, PermissionCategory } from "@burnless/ai";
import { domainRegistry } from "@/lib/domains/registry";
import { forecastingSchemas, forecastingHandlers } from "./forecasting";
import { analyticsSchemas, analyticsHandlers } from "./analytics";
import { webSearchSchemas, webSearchHandlers } from "./web-search";
import { webScrapingSchemas, webScrapingHandlers } from "./web-scraping";
import { genuiDisplaySchemas, genuiDisplayHandlers } from "./genui-display";
import { transactionSchemas, transactionHandlers } from "./transactions";
import { companyKnowledgeSchemas, companyKnowledgeHandlers } from "./company-knowledge";
import { skillsSchemas, skillsHandlers } from "./skills";
import { calculateSchemas, calculateHandlers } from "./calculate";
// NOTE: "./mcp-describe" only — "./mcp" pulls next-auth via ai-feature-flags
// and is loaded lazily inside executeToolCall instead.
import { describeMcpToolAction } from "./mcp-describe";
import { resolveToolScenario } from "./resolve-tool-scenario";

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
  ...transactionSchemas,
  ...companyKnowledgeSchemas,
  ...skillsSchemas,
  ...calculateSchemas,
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
  ...transactionHandlers,
  ...companyKnowledgeHandlers,
  ...skillsHandlers,
  ...calculateHandlers,
};

// ── Mutation tagging (for guardrail enforcement) ────────────────────────────

/** All ToolDefinitions across every REGISTERED domain (enablement-agnostic — a
 *  disabled tool never executes, so classifying it is harmless). Falls back to
 *  finance-only until registerDomains() has run (both the chat and MCP routes
 *  trigger it before any tool executes). Memoized once the registry is populated.
 *
 *  Generalizes mutation classification from finance-static to registry-wide: any
 *  active domain tool's `mutates`/`nonFacade`/`cacheTags` metadata is honored
 *  exactly like a finance mutation. The registry module imports only ./contracts
 *  + @/lib/capabilities — no static edge back here — so this introduces no cycle. */
let _registeredTools: ToolDefinition[] | null = null;
function registeredTools(): ToolDefinition[] {
  if (_registeredTools) return _registeredTools;
  const tools = domainRegistry.getAll().flatMap((m) => m.tools);
  if (tools.length === 0) return getFinancialTools(); // pre-registration fallback (don't memoize)
  _registeredTools = tools;
  return tools;
}

/** Tools that create, update, or delete data — `mutates` is "write" or "delete".
 *  Registry-derived so a domain write tool (defined in apps/web) gates the
 *  diff-gate / cache invalidation / permission resolver just like a finance one. */
function isMutationTool(toolName: string): boolean {
  return registeredTools().some(
    (t) => t.name === toolName && (t.mutates === "write" || t.mutates === "delete"),
  );
}

/** Mutation tools that DON'T route through the scenario-mutate facade — they
 *  write non-overridable tables directly (scenario CRUD writes `scenarios`;
 *  investor writes `fundingRoundInvestors`; remember_fact/forget_fact write
 *  `memory`) and ignore ctx.mode. They cannot be previewed as a scenario-override
 *  diff, so plan mode must not run them (it would write while auditing
 *  pending_apply). See worklog Plan 3 / carry-over follow-up a. Derived from
 *  ToolDefinition.nonFacade. */
function isNonFacadeMutationTool(toolName: string): boolean {
  return registeredTools().some((t) => t.name === toolName && t.nonFacade === true);
}

/** A mutation whose plan mode yields a real scenario-override delta (diff-gate). */
function isDiffableMutationTool(toolName: string): boolean {
  return isMutationTool(toolName) && !isNonFacadeMutationTool(toolName);
}

/** Tools where `scenarioId` is the tool's OWN required operand (the scenario to
 *  act on), NOT a per-call read/write override target. The generic §4.4 override
 *  must NOT hijack/strip `scenarioId` for these — it would erase the operand the
 *  handler needs. (`activate_scenario` selects/activates THAT scenario by id.) */
const SCENARIO_ID_OPERAND_TOOLS: ReadonlySet<string> = new Set<string>([
  "activate_scenario",
]);

/** The cache tags a mutation tool should invalidate, from ToolDefinition.cacheTags.
 *  Scenario-override changes also invalidate "scenario-overrides" so the banner /
 *  diff views refresh. Registry-derived. record_transaction is intentionally
 *  absent (no cacheTags annotation) — it writes the uncached transactions ledger. */
function cacheTagsForTool(toolName: string): string[] | undefined {
  const t = registeredTools().find((t) => t.name === toolName);
  return t?.cacheTags && t.cacheTags.length > 0 ? t.cacheTags : undefined;
}

function invalidateCacheForTool(toolName: string): void {
  const tags = cacheTagsForTool(toolName);
  if (tags) {
    for (const tag of tags) {
      revalidateTag(tag, { expire: 0 });
    }
  }
}

/** Permission categories for active domain tools, from their `mutates` metadata.
 *  Fed into resolvePermission's dynamicCategories (the same hook MCP tools use) so
 *  a domain write tool defined in apps/web is gated like a finance mutation. */
export function buildDomainToolCategories(
  tools: ToolDefinition[],
): Record<string, PermissionCategory> {
  const out: Record<string, PermissionCategory> = {};
  for (const t of tools) {
    if (t.mutates === "delete") out[t.name] = "delete";
    else if (t.mutates === "write") out[t.name] = "write";
  }
  return out;
}

function describeMutation(toolName: string, input: Record<string, unknown>): string {
  // Tool names follow a verb_noun convention (create_forecast_line,
  // record_transaction, remember_fact, forget_fact). Derive the human verb from
  // the first segment and the entity from the rest — generic across finance AND
  // domain tools. The previous fixed-prefix table fell through to "delete" for
  // any unrecognized verb, mislabeling domain writes like remember_fact as
  // "delete remember fact" on the permission card. For a name with no underscore
  // (none today), fall back to the registry's mutation class so the verb still
  // reflects intent rather than defaulting to "delete".
  const sep = toolName.indexOf("_");
  let action: string;
  let entity: string;
  if (sep > 0) {
    action = toolName.slice(0, sep);
    entity = toolName.slice(sep + 1).replace(/_/g, " ");
  } else {
    const mutates = registeredTools().find((t) => t.name === toolName)?.mutates;
    action = mutates === "delete" ? "delete" : "update";
    entity = toolName.replace(/_/g, " ");
  }
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
      source: context.auditSource ?? "chat",
      scheduledJobRunId: context.scheduledJobRunId ?? null,
      credentialType: context.credentialType ?? null,
      credentialId: context.credentialId ?? null,
      clientInfo: context.clientInfo ?? null,
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

  // External MCP tools (spec §3.4): namespaced mcp__<slug>__<tool>, validated by
  // the MCP server itself (schemas live on the server, not in toolSchemas);
  // audited inside executeMcpTool with mcpConnectionId.
  if (toolName.startsWith("mcp__")) {
    // Plan-mode safety: MCP dispatch hits the LIVE external server (send email,
    // refund, create invoice — executeMcpTool has no plan mode). A diff-gate
    // preview must NEVER execute one — return the empty plan envelope (no diff →
    // plain permission card); the real call happens only on approved resume.
    if (context.mode === "plan") {
      const planned = { planned: true, overrides: [] };
      logToolAudit(context, toolName, input, "pending_apply", planned, Math.round(performance.now() - startTime));
      return JSON.stringify(planned);
    }
    const { executeMcpTool } = await import("./mcp");
    if (!context.companyId) return "Error: Company ID is required for MCP tools.";
    return executeMcpTool(toolName, input, context as ToolContext & { companyId: string });
  }

  // Explicit per-call scenario targeting (spec §4.4): if the model passed a
  // `scenarioId` (a UUID or "base"), resolve it, override the turn target for THIS
  // call only, and strip it from the input so the per-tool schema validates cleanly
  // and read tools fall back to the resolved ctx value (never the raw "base" string).
  // From here down, use `ctx`/`toolInput` (not `context`/`input`): they carry the
  // resolved per-call scenario target and the scenarioId-stripped payload.
  let ctx = context;
  let toolInput = input;
  if (
    !SCENARIO_ID_OPERAND_TOOLS.has(toolName) &&
    "scenarioId" in input &&
    input.scenarioId !== undefined
  ) {
    const { scenarioId: explicit, ...rest } = input;
    const resolved = await resolveToolScenario(typeof explicit === "string" ? explicit : undefined, context);
    if (!resolved.ok) {
      const errorResult = { error: resolved.error };
      logToolAudit(context, toolName, input, "error", errorResult, Math.round(performance.now() - startTime));
      return JSON.stringify(errorResult);
    }
    ctx = { ...context, scenarioId: resolved.scenarioId };
    toolInput = rest;
  }

  // Validate input before execution
  const validation = validateToolInput(toolName, toolInput);
  if (!validation.success) {
    const errorResult = { error: validation.error };
    logToolAudit(ctx, toolName, toolInput, "validation_error", errorResult, Math.round(performance.now() - startTime));
    return JSON.stringify(errorResult);
  }
  const data = validation.data;

  const handler = toolHandlers[toolName];
  if (!handler) {
    const errorResult = { error: `Unknown tool: ${toolName}` };
    logToolAudit(ctx, toolName, toolInput, "error", errorResult, Math.round(performance.now() - startTime));
    return JSON.stringify(errorResult);
  }

  // Plan-mode safety (worklog Plan 3): a non-facade mutation cannot be previewed
  // as a scenario-override delta and would WRITE if its handler ran. In plan mode,
  // skip execution entirely and return an empty plan envelope so the diff-gate
  // shows no diff (plain permission card); the real write happens on Apply (commit).
  if (ctx.mode === "plan" && isMutationTool(toolName) && !isDiffableMutationTool(toolName)) {
    const planned = JSON.stringify({ planned: true, overrides: [] });
    logToolAudit(ctx, toolName, toolInput, "pending_apply", { planned: true, overrides: [] }, Math.round(performance.now() - startTime));
    return planned;
  }

  let result: string;
  try {
    result = await handler(data, ctx);
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg = err instanceof Error ? err.message : String(err);
    logToolAudit(ctx, toolName, toolInput, "error", { error: errorMsg }, durationMs);
    return JSON.stringify({ error: `Tool execution failed: ${errorMsg}` });
  }

  const isPlan = ctx.mode === "plan";

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
  logToolAudit(ctx, toolName, toolInput, isPlan ? "pending_apply" : "success", parsedResult, durationMs);

  return result;
}

/** Human-readable description of a tool action, e.g. `create forecast line "AWS"`. */
export function describeToolAction(toolName: string, input: Record<string, unknown>): string {
  // MCP tools don't follow the create_/update_/delete_ naming convention —
  // without this, the fallback below labels every MCP call "delete ...".
  return describeMcpToolAction(toolName, input) ?? describeMutation(toolName, input);
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

/**
 * Merged tool handler map for all financial tools (A3a-2: exposed for DomainModule).
 * Internal — do not use outside of domain module wiring.
 */
export { toolHandlers };

/** Internal handles exposed for regression guards only — not a public API.
 *  Registry-derived (A3b-3): the raw Set/Record are gone — guards consume the
 *  predicates / snapshot getters, which read the same lazy `registeredTools()`
 *  source the live execution path uses. The snapshot getters reconstruct the
 *  pre-A3b shapes (Set / Record) so the existing membership guards stay valid. */
export const __testables = {
  isMutationTool,
  isNonFacadeMutationTool,
  isDiffableMutationTool,
  cacheTagsForTool,
  /** Set of every registry mutation tool name (write ∪ delete). */
  get MUTATION_TOOLS(): ReadonlySet<string> {
    return new Set(
      registeredTools()
        .filter((t) => t.mutates === "write" || t.mutates === "delete")
        .map((t) => t.name),
    );
  },
  /** Set of every registry non-facade mutation tool name. */
  get NON_FACADE_MUTATION_TOOLS(): ReadonlySet<string> {
    return new Set(registeredTools().filter((t) => t.nonFacade === true).map((t) => t.name));
  },
  /** tool → cacheTags map for every registry tool that declares cacheTags. */
  get MUTATION_CACHE_TAGS(): Readonly<Record<string, string[]>> {
    return Object.fromEntries(
      registeredTools()
        .filter((t) => t.cacheTags && t.cacheTags.length > 0)
        .map((t) => [t.name, t.cacheTags!]),
    );
  },
};
