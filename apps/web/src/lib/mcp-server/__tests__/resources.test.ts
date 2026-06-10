/**
 * Report resources (spec §4.5, B4): read-scope gate, scenario-awareness via
 * session state, routing to existing compute paths (no new math).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecuteToolCall, mockComputeCapTable } = vi.hoisted(() => ({
  mockExecuteToolCall: vi.fn(),
  mockComputeCapTable: vi.fn(async () => ({ shareholders: [], isEmpty: true })),
}));

vi.mock("@/lib/ai-tools", () => ({ executeToolCall: mockExecuteToolCall }));
vi.mock("@/lib/compute-cap-table", () => ({ computeCapTableForCompany: mockComputeCapTable }));

import { MCP_RESOURCES, buildMcpReadResource } from "../resources";
import type { McpSessionState } from "@burnless/mcp/server";

function makeReader(scopes: string[], scenarioId: string | null = null) {
  const state: McpSessionState = { scenarioId, scopes };
  return buildMcpReadResource({
    auth: { userId: "u1", companyId: "c1" },
    state,
  });
}

beforeEach(() => {
  mockExecuteToolCall.mockReset();
  mockExecuteToolCall.mockResolvedValue(
    JSON.stringify({ success: true, profitAndLoss: { revenue: 100 }, cashFlow: { endingCash: 50 } })
  );
  mockComputeCapTable.mockClear();
});

describe("MCP_RESOURCES (spec §4.5)", () => {
  it("lists exactly the four report resources, all application/json", () => {
    expect(MCP_RESOURCES.map((r) => r.uri)).toEqual([
      "burnless://reports/pnl",
      "burnless://reports/cash-flow",
      "burnless://reports/metrics",
      "burnless://reports/cap-table",
    ]);
    for (const r of MCP_RESOURCES) expect(r.mimeType).toBe("application/json");
  });
});

describe("buildMcpReadResource", () => {
  it("requires the read scope", async () => {
    const read = makeReader([]);
    await expect(read("burnless://reports/pnl")).rejects.toThrow(/read/);
  });

  it("pnl + cash-flow route through get_financial_statements; metrics through get_metrics", async () => {
    const read = makeReader(["read"]);
    const pnl = JSON.parse(await read("burnless://reports/pnl"));
    expect(pnl.profitAndLoss.revenue).toBe(100);
    const cf = JSON.parse(await read("burnless://reports/cash-flow"));
    expect(cf.cashFlow.endingCash).toBe(50);
    await read("burnless://reports/metrics");
    expect(mockExecuteToolCall).toHaveBeenNthCalledWith(1, "get_financial_statements", {}, expect.objectContaining({ companyId: "c1" }));
    expect(mockExecuteToolCall).toHaveBeenNthCalledWith(3, "get_metrics", {}, expect.objectContaining({ companyId: "c1" }));
  });

  it("is scenario-aware via the session state (spec §4.5)", async () => {
    const read = makeReader(["read"], "scen-9");
    await read("burnless://reports/metrics");
    expect(mockExecuteToolCall).toHaveBeenCalledWith("get_metrics", {}, expect.objectContaining({ scenarioId: "scen-9" }));
    await read("burnless://reports/cap-table");
    expect(mockComputeCapTable).toHaveBeenCalledWith("c1", "scen-9");
  });

  it("?period maps to startDate/endDate tool input; malformed period falls back to {}", async () => {
    const read = makeReader(["read"]);
    await read("burnless://reports/pnl?period=2026-01..2026-12");
    expect(mockExecuteToolCall).toHaveBeenLastCalledWith(
      "get_financial_statements",
      { startDate: "2026-01", endDate: "2026-12" },
      expect.objectContaining({ companyId: "c1" })
    );
    await read("burnless://reports/metrics?period=garbage");
    expect(mockExecuteToolCall).toHaveBeenLastCalledWith("get_metrics", {}, expect.anything());
  });

  it("unknown uri throws", async () => {
    const read = makeReader(["read"]);
    await expect(read("burnless://reports/nope")).rejects.toThrow(/Unknown resource/);
  });
});
