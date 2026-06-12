// apps/web/src/lib/automations/__tests__/runner-tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn().mockResolvedValue('{"ok":true}') }));
vi.mock("@/lib/ai-tools", () => ({ executeToolCall: mockExecute }));

// MUTATION_TOOL_NAMES from @burnless/ai — provide a deterministic set for the test.
vi.mock("@burnless/ai", async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return {
    ...actual,
    MUTATION_TOOL_NAMES: new Set(["update_revenue_stream", "record_transaction"]),
    getFinancialTools: () => [
      { name: "list_accounts", description: "", inputSchema: { type: "object", properties: {} } },
      { name: "update_revenue_stream", description: "", inputSchema: { type: "object", properties: {} } },
      { name: "delete_account", description: "", inputSchema: { type: "object", properties: {} } },
    ],
  };
});

import { assembleAllowedTools, makeOnToolCall } from "../runner";

const baseCtx = { companyId: "c1", userId: "u1", auditSource: "scheduled_job" as const, scheduledJobRunId: "run1" };

describe("assembleAllowedTools", () => {
  it("includes only allowlisted financial + MCP tools", () => {
    const mcpTools = [{ name: "mcp__stripe__list_charges", description: "", inputSchema: { type: "object", properties: {} } }];
    const tools = assembleAllowedTools(["list_accounts", "mcp__stripe__list_charges"], mcpTools);
    expect(tools.map((t) => t.name).sort()).toEqual(["list_accounts", "mcp__stripe__list_charges"]);
    // delete_account / update_revenue_stream NOT allowlisted → excluded
    expect(tools.some((t) => t.name === "delete_account")).toBe(false);
  });
});

describe("makeOnToolCall — commit", () => {
  beforeEach(() => mockExecute.mockClear());
  it("executes in commit mode", async () => {
    const onToolCall = makeOnToolCall(baseCtx, { dryRun: false, allowedNames: new Set(["list_accounts"]) });
    await onToolCall("list_accounts", {});
    expect(mockExecute).toHaveBeenCalledWith("list_accounts", {}, expect.objectContaining({ mode: "commit", scheduledJobRunId: "run1" }));
  });
});

describe("makeOnToolCall — dry-run", () => {
  beforeEach(() => mockExecute.mockClear());
  it("SUPPRESSES mutation tools (no execution, no write)", async () => {
    const onToolCall = makeOnToolCall(baseCtx, { dryRun: true, allowedNames: new Set(["update_revenue_stream"]) });
    const out = JSON.parse(await onToolCall("update_revenue_stream", { mrr: 12480 }));
    expect(mockExecute).not.toHaveBeenCalled(); // never written
    expect(out.dryRun).toBe(true);
    expect(out.suppressed).toBe(true);
  });
  it("executes READ tools (plan mode) so the model can narrate the preview", async () => {
    const onToolCall = makeOnToolCall(baseCtx, { dryRun: true, allowedNames: new Set(["list_accounts"]) });
    await onToolCall("list_accounts", {});
    expect(mockExecute).toHaveBeenCalledWith("list_accounts", {}, expect.objectContaining({ mode: "plan" }));
  });
});

describe("makeOnToolCall — allowlist guard", () => {
  beforeEach(() => mockExecute.mockClear());
  it("refuses a tool outside the allowlist without executing", async () => {
    const onToolCall = makeOnToolCall(baseCtx, { dryRun: false, allowedNames: new Set(["list_accounts"]) });
    const out = JSON.parse(await onToolCall("delete_account", { id: "x" }));
    expect(mockExecute).not.toHaveBeenCalled();
    expect(out.error).toMatch(/allowlist/i);
  });
});
