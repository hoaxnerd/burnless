/**
 * AI tool permission model (spec §3).
 *
 * Five categories; each tool maps to exactly one. The resolver is pure: it
 * returns "allow", "ask", or "deny". An explicit "deny" is produced by the
 * read_only write-mode clamp (spec §4.4); it is also a runtime user action
 * taken at the permission card (Plan 3).
 */

import type { AiWriteMode } from "./feature-flags";

export type PermissionCategory = "read" | "write" | "delete" | "web_search" | "browser_use";

/** How a category behaves by default. `delete` never uses "always". */
export type PermissionMode = "ask" | "session" | "always";

export type PermissionDecision = "allow" | "ask" | "deny";

export interface PermissionDefaults {
  read: PermissionMode;
  write: PermissionMode;
  delete: PermissionMode; // "always" is invalid for delete and is clamped to "ask"
  web_search: PermissionMode;
  browser_use: PermissionMode;
}

/** Builtin defaults applied when a user has no saved row. */
export const BUILTIN_PERMISSION_DEFAULTS: PermissionDefaults = {
  read: "always",
  web_search: "always",
  write: "ask",
  delete: "ask",
  browser_use: "ask",
};

// ── Tool → category map (single source of truth) ─────────────────────────────

const WEB_SEARCH_TOOLS = new Set<string>(["search_web", "read_webpage"]);
// The `browser_use` category has no built-in member anymore (the Cloudflare-CDP
// `read_webpage_rendered` tool was removed in S3a #33). Full browser control is
// now MCP-only — a connected Playwright MCP server's `mcp__*` browser tools
// classify into `browser_use` via the per-turn dynamicCategories map.
const BROWSER_TOOLS = new Set<string>([]);

const DELETE_TOOLS = new Set<string>([
  "delete_forecast_line",
  "delete_revenue_stream",
  "delete_headcount",
  "delete_department",
  "delete_account",
  "delete_scenario",
  "delete_funding_round",
]);

const WRITE_TOOLS = new Set<string>([
  "create_forecast_line",
  "update_forecast_line",
  "create_revenue_stream",
  "update_revenue_stream",
  "create_headcount",
  "update_headcount",
  "create_salary_change",
  "create_bonus",
  "create_equity_grant",
  "create_department",
  "update_department",
  "create_account",
  "update_account",
  "create_scenario",
  "update_scenario",
  "create_funding_round",
  "update_funding_round",
  "create_funding_round_investor",
  "update_grant_milestone",
  "record_transaction",
]);

/** All tools that mutate data (write + delete). */
export const MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  ...WRITE_TOOLS,
  ...DELETE_TOOLS,
]);

/** Classify a tool into its permission category. Dynamic map (MCP tools, computed
 *  per-turn from connection prefs + hints) wins; mcp__* without an entry is
 *  treated as write (safe-by-default, spec D5); everything else unknown → read. */
export function categorizeToolName(
  toolName: string,
  dynamicCategories?: Record<string, PermissionCategory>
): PermissionCategory {
  // Own-property check: a hallucinated tool name like "constructor"/"toString"
  // must not resolve an Object.prototype member as its category.
  const dynamic =
    dynamicCategories && Object.hasOwn(dynamicCategories, toolName)
      ? dynamicCategories[toolName]
      : undefined;
  if (dynamic) return dynamic;
  if (toolName.startsWith("mcp__")) return "write";
  if (WEB_SEARCH_TOOLS.has(toolName)) return "web_search";
  if (BROWSER_TOOLS.has(toolName)) return "browser_use";
  if (DELETE_TOOLS.has(toolName)) return "delete";
  if (WRITE_TOOLS.has(toolName)) return "write";
  return "read";
}

// ── Resolver ─────────────────────────────────────────────────────────────────

export interface ResolvePermissionContext {
  /** The user's saved per-category defaults. */
  defaults: PermissionDefaults;
  /** Categories granted "for session" in the current conversation. */
  sessionGrants: Partial<Record<PermissionCategory, boolean>>;
  /** Company AI write mode (spec §4.4). Absent → "full" (no clamp; back-compat). */
  writeMode?: AiWriteMode;
  /** Per-turn category map for dynamically-sourced (MCP) tools. */
  dynamicCategories?: Record<string, PermissionCategory>;
}

/**
 * Resolve whether a tool call may proceed without prompting.
 * Returns "allow" (run it), "ask" (pause for a card), or "deny" (refuse — never
 * execute; used by the read_only write-mode clamp).
 */
export function resolvePermission(
  toolName: string,
  ctx: ResolvePermissionContext
): PermissionDecision {
  const category = categorizeToolName(toolName, ctx.dynamicCategories);

  // Write-mode clamp (spec §4.4): layered BEFORE the session-grant short-circuit
  // so neither a grant nor an "always" default can bypass it. Mirrors the delete
  // clamp. Reads pass through untouched.
  const writeMode = ctx.writeMode ?? "full";
  if (category === "write" || category === "delete") {
    if (writeMode === "read_only") return "deny"; // refuse; chatStream synthesizes a declined result
    if (writeMode === "confirm") return "ask";    // force the diff-gate
    // "full" falls through to today's per-category resolution.
  }

  // 1. A session grant on this category short-circuits to allow.
  if (ctx.sessionGrants[category]) return "allow";

  // 2. The user's standing default.
  const mode = ctx.defaults[category];
  // Delete is destructive: a standing "always" is invalid and clamped to "ask".
  if (category === "delete") return "ask";
  if (mode === "always") return "allow";

  // "session" (no grant yet) and "ask" both require prompting.
  return "ask";
}
