/**
 * MCP tool wiring (spec §4.2/§4.3/§4.4): exposed list = packages/ai surface;
 * the execute closure gates scope-per-category, clamps read_only writeMode,
 * intercepts activate_scenario into session state, then dispatches through
 * executeToolCall (Zod validation, cache tags, audit ride along).
 *
 * A3a-3: getExposedMcpToolDefs and the exposed set in buildMcpExecuteTool now
 * resolve through domainRegistry.getActiveMcpExposedTools (byte-identical:
 * finance is the only domain, so the set equals getMcpExposedTools()).
 * The exposed set is computed EAGERLY before the sync executor closure to avoid
 * a race where the closure captures a pending Promise (explorer landmine #4).
 */
import { categorizeToolName } from "@burnless/ai";
import type { BurnlessToolDef, McpClientInfo, McpSessionState } from "@burnless/mcp/server";
import { getScenarioForCompany } from "@burnless/db";
import { executeToolCall } from "@/lib/ai-tools";
import { getAiFlags } from "@/lib/ai-feature-flags";
import type { McpAuthResult } from "./auth";

export async function getExposedMcpToolDefs(): Promise<BurnlessToolDef[]> {
  const { domainRegistry } = await import("@/lib/domains");
  const tools = await domainRegistry.getActiveMcpExposedTools({});
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Record<string, unknown>,
  }));
}

export interface McpExecuteDeps {
  auth: Pick<McpAuthResult, "userId" | "companyId" | "credentialType" | "credentialId">;
  /** Session-scoped scenario + per-request-refreshed scopes (packages/mcp). */
  state: McpSessionState;
  clientInfo: McpClientInfo | null;
}

export async function buildMcpExecuteTool(
  deps: McpExecuteDeps
): Promise<(toolName: string, input: Record<string, unknown>) => Promise<string>> {
  // Compute the exposed set EAGERLY before returning the sync executor closure
  // (explorer landmine #4 — must not capture a pending Promise in the closure).
  const { domainRegistry } = await import("@/lib/domains");
  const exposedTools = await domainRegistry.getActiveMcpExposedTools({ companyId: deps.auth.companyId });
  const exposed = new Set(exposedTools.map((t) => t.name));

  return async (toolName, input) => {
    // Gate refusals THROW (not return-as-string): createBurnlessMcpServer turns a
    // throw into an `isError: true` tool result, so an agent that branches on
    // isError sees the refusal as a failure — not a silent success. Returning the
    // error as a normal payload would flag isError:false and mislead the caller.
    if (!exposed.has(toolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Scope gate (spec §4.3 step 5). web_search/browser_use cannot appear —
    // the exclusion set keeps those tools out — but guard defensively.
    const category = categorizeToolName(toolName);
    if (category === "web_search" || category === "browser_use") {
      throw new Error(`Tool ${toolName} is not available over MCP.`);
    }
    if (!deps.state.scopes.includes(category)) {
      throw new Error(
        `Insufficient scope: ${toolName} requires the "${category}" scope, but this credential grants [${deps.state.scopes.join(", ")}].`
      );
    }

    // Defense in depth (spec §4.3 step 5): company-level read_only beats any
    // write-scoped token. "confirm" does NOT gate MCP — scopes are the consent.
    if (category === "write" || category === "delete") {
      const flags = await getAiFlags(deps.auth.companyId);
      if (flags.writeMode === "read_only") {
        throw new Error("Write refused: this company's AI write mode is read-only.");
      }
    }

    // activate_scenario is session-scoped over MCP (spec §4.4): the chat
    // handler sets cookies — wrong surface here. Validate tenancy, set
    // session state, and return WITHOUT calling executeToolCall.
    if (toolName === "activate_scenario") {
      const scenarioId = typeof input.scenarioId === "string" ? input.scenarioId : null;
      if (!scenarioId) {
        deps.state.scenarioId = null;
        return JSON.stringify({
          success: true,
          activeScenarioId: null,
          message: "Switched to the base (no-scenario) view for this MCP session.",
        });
      }
      const scenario = await getScenarioForCompany(scenarioId, deps.auth.companyId);
      if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found for this company.`);
      }
      deps.state.scenarioId = scenario.id;
      return JSON.stringify({
        success: true,
        activeScenarioId: scenario.id,
        scenarioName: scenario.name,
        message: `Activated scenario "${scenario.name}" for this MCP session.`,
      });
    }

    // ToolContext.scenarioId semantics unchanged (spec §9.8); audit
    // attribution rides along (spec §4.3 step 7).
    return executeToolCall(toolName, input, {
      companyId: deps.auth.companyId,
      userId: deps.auth.userId,
      scenarioId: deps.state.scenarioId,
      mode: "commit",
      permissionDecision: "auto",
      auditSource: "mcp_server",
      credentialType: deps.auth.credentialType,
      credentialId: deps.auth.credentialId,
      clientInfo: deps.clientInfo,
    });
  };
}
