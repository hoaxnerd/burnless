/**
 * Bounded agent runner (S3a Plan 4 §4). Runs a scheduled job as a capped,
 * headless reuse of the chat tool-loop, constrained to the job's FROZEN tool
 * allowlist. No live session: all context (companyId, createdByUserId, audit
 * link) is explicit. Mirrors the headless precedent in lib/cron/batch-regenerate.ts.
 */
import { MUTATION_TOOL_NAMES, getFinancialTools, type ToolDefinition } from "@burnless/ai";
import { executeToolCall } from "@/lib/ai-tools";
import type { ToolContext } from "@/lib/ai-tools/types";

/** Frozen toolset offered to the provider: allowlisted financial + (pre-filtered) MCP tools. */
export function assembleAllowedTools(allowedTools: string[], mcpTools: ToolDefinition[]): ToolDefinition[] {
  const allow = new Set(allowedTools);
  const financial = getFinancialTools().filter((t) => allow.has(t.name));
  const mcp = mcpTools.filter((t) => allow.has(t.name));
  return [...financial, ...mcp];
}

export interface DispatchOptions {
  dryRun: boolean;
  allowedNames: Set<string>;
}

/**
 * Build the `onToolCall` the chat loop invokes per tool_use.
 * - commit: real execution (mode "commit").
 * - dry-run: mutation tools are SUPPRESSED (never executed → zero writes, for
 *   base-table AND facade tools); read tools run in plan mode so the model can
 *   describe the would-be change.
 * - allowlist guard: a tool outside the set is refused (defense-in-depth).
 */
export function makeOnToolCall(
  ctx: ToolContext,
  opts: DispatchOptions
): (toolName: string, input: Record<string, unknown>) => Promise<string> {
  return async (toolName, input) => {
    if (!opts.allowedNames.has(toolName)) {
      return JSON.stringify({ error: `Tool "${toolName}" is not in this job's allowlist.` });
    }
    const isMutation = MUTATION_TOOL_NAMES.has(toolName);
    if (opts.dryRun && isMutation) {
      return JSON.stringify({
        dryRun: true,
        suppressed: true,
        tool: toolName,
        input,
        note: "DRY RUN — no data was written. Describe to the user what this change WOULD do on a real run.",
      });
    }
    return executeToolCall(toolName, input, { ...ctx, mode: opts.dryRun ? "plan" : "commit" });
  };
}
