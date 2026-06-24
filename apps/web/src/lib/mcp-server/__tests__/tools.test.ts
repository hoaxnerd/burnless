/**
 * Tool execute closure (spec §4.3 steps 5-6, §4.4): scope-per-category gate,
 * read_only writeMode clamp, activate_scenario session interception
 * (validated against the company, NEVER dispatched to executeToolCall),
 * pass-through ToolContext shape for everything else.
 *
 * A3a-3: getExposedMcpToolDefs and buildMcpExecuteTool are now async (they
 * resolve through domainRegistry.getActiveMcpExposedTools). The mock below
 * returns getMcpExposedTools() so the parity assertion holds.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUser, createCompany, createScenario } from "@db-test/factories";

const { mockExecuteToolCall, mockGetAiFlags } = vi.hoisted(() => ({
  mockExecuteToolCall: vi.fn(async () => JSON.stringify({ ok: true })),
  mockGetAiFlags: vi.fn(async () => ({ writeMode: "full" })),
}));

vi.mock("@/lib/ai-tools", () => ({ executeToolCall: mockExecuteToolCall }));
vi.mock("@/lib/ai-feature-flags", () => ({ getAiFlags: mockGetAiFlags }));

// A3a-3: stub domainRegistry so the tools.ts module resolves MCP tools without
// spinning up the full registry + DB. Returns the real getMcpExposedTools() output
// so the parity assertion in getExposedMcpToolDefs passes byte-identically.
vi.mock("@/lib/domains", async () => {
  const { getMcpExposedTools } = await import("@burnless/ai");
  return {
    domainRegistry: {
      getActiveMcpExposedTools: vi.fn(async () => getMcpExposedTools()),
    },
  };
});

import { buildMcpExecuteTool, getExposedMcpToolDefs } from "../tools";
import type { McpSessionState } from "@burnless/mcp/server";

async function makeDeps(scopes: string[], companyId: string, userId: string) {
  const state: McpSessionState = { scenarioId: null, scopes };
  return {
    state,
    execute: await buildMcpExecuteTool({
      auth: { userId, companyId, credentialType: "pat" as const, credentialId: "tok-1" },
      state,
      clientInfo: { name: "test", version: "1" },
    }),
  };
}

beforeEach(() => {
  mockExecuteToolCall.mockClear();
  mockGetAiFlags.mockClear();
  mockGetAiFlags.mockResolvedValue({ writeMode: "full" });
});

describe("getExposedMcpToolDefs", () => {
  it("mirrors the packages/ai surface (no genui/propose_plan/web tools)", async () => {
    const names = new Set((await getExposedMcpToolDefs()).map((t) => t.name));
    expect(names.has("get_metrics")).toBe(true);
    expect(names.has("show_metric_card")).toBe(false);
    expect(names.has("propose_plan")).toBe(false);
    expect(names.has("search_web")).toBe(false);
  });
});

describe("buildMcpExecuteTool", () => {
  it("read tool with read scope → executeToolCall with base-view context", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = await makeDeps(["read"], company.id, user.id);
    const result = await execute("get_metrics", {});
    expect(JSON.parse(result).ok).toBe(true);
    expect(mockExecuteToolCall).toHaveBeenCalledWith("get_metrics", {}, expect.objectContaining({
      companyId: company.id,
      userId: user.id,
      scenarioId: null,
      mode: "commit",
      permissionDecision: "auto",
      auditSource: "mcp_server",
      credentialType: "pat",
      credentialId: "tok-1",
      clientInfo: { name: "test", version: "1" },
    }));
  });

  // Gate refusals THROW so createBurnlessMcpServer flags the tool result
  // isError:true (an agent must not read a refusal as a silent success).
  it("write tool WITHOUT write scope → throws naming the missing scope, no dispatch", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = await makeDeps(["read"], company.id, user.id);
    await expect(execute("create_scenario", { name: "X" })).rejects.toThrow('"write"');
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("delete tool needs delete scope (throws)", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = await makeDeps(["read", "write"], company.id, user.id);
    await expect(execute("delete_scenario", { id: "s1" })).rejects.toThrow('"delete"');
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("writeMode read_only refuses writes even with a write-scoped token (spec §4.3.5)", async () => {
    mockGetAiFlags.mockResolvedValue({ writeMode: "read_only" });
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = await makeDeps(["read", "write", "delete"], company.id, user.id);
    await expect(execute("create_scenario", { name: "X" })).rejects.toThrow("read-only");
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
    // reads still pass
    const read = JSON.parse(await execute("get_metrics", {}));
    expect(read.ok).toBe(true);
  });

  it("activate_scenario sets session state and NEVER calls executeToolCall (spec §4.4)", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const scenario = await createScenario(company.id);
    const { execute, state } = await makeDeps(["read"], company.id, user.id);
    const result = JSON.parse(await execute("activate_scenario", { scenarioId: scenario.id }));
    expect(result.success).toBe(true);
    expect(state.scenarioId).toBe(scenario.id);
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
    // subsequent calls thread the session scenario
    await execute("get_metrics", {});
    expect(mockExecuteToolCall).toHaveBeenCalledWith("get_metrics", {}, expect.objectContaining({
      scenarioId: scenario.id,
    }));
  });

  it("activate_scenario rejects a scenario from another company", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const otherOwner = await createUser();
    const otherCompany = await createCompany(otherOwner.id);
    const foreign = await createScenario(otherCompany.id);
    const { execute, state } = await makeDeps(["read"], company.id, user.id);
    await expect(execute("activate_scenario", { scenarioId: foreign.id })).rejects.toThrow("not found");
    expect(state.scenarioId).toBeNull();
  });

  it("unknown / excluded tool → throws, no dispatch", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = await makeDeps(["read", "write", "delete"], company.id, user.id);
    await expect(execute("show_metric_card", {})).rejects.toThrow("Unknown tool");
    await expect(execute("totally_made_up", {})).rejects.toThrow("Unknown tool");
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });
});
