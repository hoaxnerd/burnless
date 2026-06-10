/**
 * Confirm-card label for MCP tool calls — kept in its own module so
 * ai-tools/index.ts (sync describeToolAction) can import it without pulling
 * the rest of ./mcp's graph (ai-feature-flags → next-auth) into every test.
 */
import { parseMcpToolName } from "@burnless/mcp";

/** Confirm-card label for an MCP tool call, or null for non-MCP tool names.
 *  Live-smoke finding: describeMutation's create_/update_/else-delete heuristic
 *  labeled every MCP tool "delete ..." on the permission card. */
export function describeMcpToolAction(toolName: string, input: Record<string, unknown>): string | null {
  const parsed = parseMcpToolName(toolName);
  if (!parsed) return null;
  // Deferred dispatch (D6): name the actual target tool when the model supplied it.
  const target = parsed.tool === "call_tool" && typeof input.tool === "string" ? input.tool : parsed.tool;
  return `call "${target}" on ${parsed.slug} (external MCP)`;
}
