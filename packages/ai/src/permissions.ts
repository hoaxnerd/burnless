/**
 * AI tool permission model (spec §3).
 *
 * Five categories; each tool maps to exactly one. The resolver is pure: it
 * returns "allow", "ask", or "deny". An explicit "deny" is produced by the
 * read_only write-mode clamp (spec §4.4); it is also a runtime user action
 * taken at the permission card (Plan 3).
 */

import type { AiWriteMode } from "./feature-flags";
import { getFinancialTools } from "./tools";
import { DISPLAY_TOOL_NAMES, INPUT_TOOL_NAMES, PLAN_TOOL_NAMES } from "./generative-ui";

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

// Derived from tool metadata (A2b): mutates:"write" / "delete" annotations on
// each ToolDefinition in tools.ts. The hand-maintained lists are removed — the
// annotations are the single source of truth. ZERO behavior change: the
// registry-derivation snapshot test freezes the pre-A2b membership and asserts
// the derivation reproduces it exactly.
const _tools = getFinancialTools();
const WRITE_TOOLS: ReadonlySet<string> = new Set(
  _tools.filter((t) => t.mutates === "write").map((t) => t.name),
);
const DELETE_TOOLS: ReadonlySet<string> = new Set(
  _tools.filter((t) => t.mutates === "delete").map((t) => t.name),
);

/** All tools that mutate data (write + delete). */
export const MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set([
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

// ── User-controllable built-in tools (S3b §7) ────────────────────────────────

export interface BuiltinToolControl {
  name: string;
  category: PermissionCategory;
}

/**
 * Built-in tools a user may individually disable in the Tools pane. Derived from
 * the live `getFinancialTools()` registry (the single source of truth) so new
 * tools surface automatically. EXCLUDES:
 *  - display/genui `show_*` tools and `request_*` input tools (they render UI,
 *    not data — DISPLAY_TOOL_NAMES ∪ INPUT_TOOL_NAMES);
 *  - the `propose_plan` plan-control tool (PLAN_TOOL_NAMES);
 *  - any `mcp__*` tool (those are governed per-connection in the Connectors
 *    category, not here).
 * Each surviving name is classified via `categorizeToolName` (read/write/delete/
 * web_search). No second list to keep in sync — the categorizer is the classifier.
 */
export function listBuiltinToolsForControl(): BuiltinToolControl[] {
  const out: BuiltinToolControl[] = [];
  for (const tool of getFinancialTools()) {
    const name = tool.name;
    if (name.startsWith("mcp__")) continue;
    if (DISPLAY_TOOL_NAMES.has(name)) continue;
    if (INPUT_TOOL_NAMES.has(name)) continue;
    if (PLAN_TOOL_NAMES.has(name)) continue;
    out.push({ name, category: categorizeToolName(name) });
  }
  return out;
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
