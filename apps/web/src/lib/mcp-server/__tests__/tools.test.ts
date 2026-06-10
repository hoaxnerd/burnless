/**
 * Tool execute closure (spec §4.3 steps 5-6, §4.4): scope-per-category gate,
 * read_only writeMode clamp, activate_scenario session interception
 * (validated against the company, NEVER dispatched to executeToolCall),
 * pass-through ToolContext shape for everything else.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUser, createCompany, createScenario } from "@db-test/factories";

const { mockExecuteToolCall, mockGetAiFlags } = vi.hoisted(() => ({
  mockExecuteToolCall: vi.fn(async () => JSON.stringify({ ok: true })),
  mockGetAiFlags: vi.fn(async () => ({ writeMode: "full" })),
}));

vi.mock("@/lib/ai-tools", () => ({ executeToolCall: mockExecuteToolCall }));
vi.mock("@/lib/ai-feature-flags", () => ({ getAiFlags: mockGetAiFlags }));

import { buildMcpExecuteTool, getExposedMcpToolDefs } from "../tools";
import type { McpSessionState } from "@burnless/mcp/server";

function makeDeps(scopes: string[], companyId: string, userId: string) {
  const state: McpSessionState = { scenarioId: null, scopes };
  return {
    state,
    execute: buildMcpExecuteTool({
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
  it("mirrors the packages/ai surface (no genui/propose_plan/web tools)", () => {
    const names = new Set(getExposedMcpToolDefs().map((t) => t.name));
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
    const { execute } = makeDeps(["read"], company.id, user.id);
    const result = await execute("get_metrics", {});
    expect(JSON.parse(result).ok).toBe(true);
    expect(mockExecuteToolCall).toHaveBeenCalledWith("get_metrics", {}, expect.objectContaining({
      companyId: company.id,
      userId: user.id,
      scenarioId: null,
      mode: "commit",
      permissionDecision: "auto",
    }));
  });

  it("write tool WITHOUT write scope → scope error naming the missing scope, no dispatch", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = makeDeps(["read"], company.id, user.id);
    const result = JSON.parse(await execute("create_scenario", { name: "X" }));
    expect(result.error).toContain('"write"');
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("delete tool needs delete scope", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = makeDeps(["read", "write"], company.id, user.id);
    const result = JSON.parse(await execute("delete_scenario", { id: "s1" }));
    expect(result.error).toContain('"delete"');
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("writeMode read_only refuses writes even with a write-scoped token (spec §4.3.5)", async () => {
    mockGetAiFlags.mockResolvedValue({ writeMode: "read_only" });
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = makeDeps(["read", "write", "delete"], company.id, user.id);
    const result = JSON.parse(await execute("create_scenario", { name: "X" }));
    expect(result.error).toContain("read-only");
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
    // reads still pass
    const read = JSON.parse(await execute("get_metrics", {}));
    expect(read.ok).toBe(true);
  });

  it("activate_scenario sets session state and NEVER calls executeToolCall (spec §4.4)", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const scenario = await createScenario(company.id);
    const { execute, state } = makeDeps(["read"], company.id, user.id);
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
    const { execute, state } = makeDeps(["read"], company.id, user.id);
    const result = JSON.parse(await execute("activate_scenario", { scenarioId: foreign.id }));
    expect(result.error).toContain("not found");
    expect(state.scenarioId).toBeNull();
  });

  it("unknown / excluded tool → error, no dispatch", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { execute } = makeDeps(["read", "write", "delete"], company.id, user.id);
    expect(JSON.parse(await execute("show_metric_card", {})).error).toContain("Unknown tool");
    expect(JSON.parse(await execute("totally_made_up", {})).error).toContain("Unknown tool");
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });
});
