/**
 * Read-only report resources (spec §4.5, B4): computed from EXISTING
 * pipelines (the statements/metrics tool handlers + compute-cap-table) —
 * no new math. Scenario-aware via the session's scenarioId. Requires the
 * read scope. ?period=YYYY-MM..YYYY-MM maps straight onto the underlying
 * tools' existing startDate/endDate inputs (get_financial_statements and
 * get_metrics both accept them — see packages/ai/src/tools.ts); omitted or
 * malformed period falls back to the handlers' default window. cap-table
 * has no period dimension and ignores it.
 */
import type { BurnlessResourceDef, McpSessionState } from "@burnless/mcp/server";
import { executeToolCall } from "@/lib/ai-tools";
import { computeCapTableForCompany } from "@/lib/compute-cap-table";

/** Parse "?period=YYYY-MM..YYYY-MM" → { startDate, endDate } tool input.
 *  Returns {} for absent/malformed values (handlers use their defaults). */
export function periodToToolInput(uri: string): Record<string, string> {
  const q = uri.split("?")[1];
  if (!q) return {};
  const period = new URLSearchParams(q).get("period");
  const m = period?.match(/^(\d{4}-\d{2})\.\.(\d{4}-\d{2})$/);
  return m ? { startDate: m[1]!, endDate: m[2]! } : {};
}

export const MCP_RESOURCES: BurnlessResourceDef[] = [
  {
    uri: "burnless://reports/pnl",
    name: "Profit & Loss summary",
    description:
      "P&L totals for the active scenario. Optional ?period=YYYY-MM..YYYY-MM (defaults to the standard 12-month window).",
    mimeType: "application/json",
  },
  {
    uri: "burnless://reports/cash-flow",
    name: "Cash flow summary",
    description:
      "Operating cash + ending cash for the active scenario. Optional ?period=YYYY-MM..YYYY-MM.",
    mimeType: "application/json",
  },
  {
    uri: "burnless://reports/metrics",
    name: "Key metrics",
    description:
      "MRR/ARR/burn/runway and the rest of the computed metric set for the active scenario.",
    mimeType: "application/json",
  },
  {
    uri: "burnless://reports/cap-table",
    name: "Cap table",
    description: "Fully-diluted cap table (scenario-aware).",
    mimeType: "application/json",
  },
];

export interface McpResourceDeps {
  auth: { userId: string; companyId: string };
  state: McpSessionState;
}

export function buildMcpReadResource(deps: McpResourceDeps): (uri: string) => Promise<string> {
  return async (uri) => {
    if (!deps.state.scopes.includes("read")) {
      throw new Error('Insufficient scope: resources require the "read" scope.');
    }
    const base = uri.split("?")[0]!;
    const ctx = {
      companyId: deps.auth.companyId,
      userId: deps.auth.userId,
      scenarioId: deps.state.scenarioId,
      mode: "commit" as const,
      permissionDecision: "auto" as const,
    };
    const period = periodToToolInput(uri);
    switch (base) {
      case "burnless://reports/pnl": {
        const payload = JSON.parse(await executeToolCall("get_financial_statements", period, ctx));
        return JSON.stringify({ profitAndLoss: payload.profitAndLoss ?? payload });
      }
      case "burnless://reports/cash-flow": {
        const payload = JSON.parse(await executeToolCall("get_financial_statements", period, ctx));
        return JSON.stringify({ cashFlow: payload.cashFlow ?? payload });
      }
      case "burnless://reports/metrics":
        return executeToolCall("get_metrics", period, ctx);
      case "burnless://reports/cap-table": {
        const capTable = await computeCapTableForCompany(deps.auth.companyId, deps.state.scenarioId);
        return JSON.stringify(capTable);
      }
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  };
}
