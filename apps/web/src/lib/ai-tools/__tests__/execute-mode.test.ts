import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, auditInsertValues } = vi.hoisted(() => {
  const revalidateTagMock = vi.fn();
  const auditInsertValues = vi.fn(() => ({ catch: () => undefined }));
  return { revalidateTagMock, auditInsertValues };
});

vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

vi.mock("@burnless/db", () => ({
  db: { insert: () => ({ values: auditInsertValues }) },
  aiToolAuditLogs: {},
}));

// Stub every domain handler module index.ts imports so the import graph loads in
// isolation. When index.ts gains a new domain module, add its stub here.
vi.mock("../scenarios", () => ({
  scenarioSchemas: {
    create_scenario: { safeParse: (input: unknown) => ({ success: true, data: input }) },
  },
  scenarioHandlers: { create_scenario: vi.fn(async () => JSON.stringify({ success: true, scenarioId: "sc1" })) },
}));
vi.mock("../headcount", () => ({ headcountSchemas: {}, headcountHandlers: {} }));
vi.mock("../funding", () => ({
  createFundingRound: vi.fn(),
  updateFundingRound: vi.fn(),
  deleteFundingRound: vi.fn(),
  addFundingRoundInvestor: vi.fn(),
  markGrantMilestoneHit: vi.fn(),
  modelDilution: vi.fn(),
}));
vi.mock("../forecasting", () => ({ forecastingSchemas: {}, forecastingHandlers: {} }));
vi.mock("../analytics", () => ({ analyticsSchemas: {}, analyticsHandlers: {} }));
vi.mock("../web-search", () => ({ webSearchSchemas: {}, webSearchHandlers: {} }));
vi.mock("../web-scraping", () => ({ webScrapingSchemas: {}, webScrapingHandlers: {} }));
vi.mock("../genui-display", () => ({ genuiDisplaySchemas: {}, genuiDisplayHandlers: {} }));
vi.mock("@burnless/ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@burnless/ai")>();
  return {
    ...real,
    CreateFundingRoundSchema: { safeParse: vi.fn() },
    UpdateFundingRoundSchema: { safeParse: vi.fn() },
    DeleteFundingRoundSchema: { safeParse: vi.fn() },
    AddFundingRoundInvestorSchema: { safeParse: vi.fn() },
    MarkGrantMilestoneHitSchema: { safeParse: vi.fn() },
    ModelDilutionSchema: { safeParse: vi.fn() },
  };
});

// Stub the revenue handler so we assert executeToolCall's mode plumbing in isolation.
vi.mock("../revenue", () => ({
  revenueSchemas: {
    create_revenue_stream: { safeParse: (input: unknown) => ({ success: true, data: input }) },
  },
  revenueHandlers: { create_revenue_stream: vi.fn(async () => JSON.stringify({ planned: true, overrides: [{ action: "create" }] })) },
}));

import { executeToolCall } from "../index";
import { __testables } from "../index";

beforeEach(() => { revalidateTagMock.mockClear(); auditInsertValues.mockClear(); });

describe("executeToolCall mode plumbing", () => {
  const ctx = { companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "conv1" };

  it("commit mode (default) invalidates cache + audits success", async () => {
    await executeToolCall("create_revenue_stream", { name: "X" }, { ...ctx, mode: "commit" });
    expect(revalidateTagMock).toHaveBeenCalled();
    expect(auditInsertValues).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("plan mode skips cache invalidation + audits pending_apply", async () => {
    await executeToolCall("create_revenue_stream", { name: "X" }, { ...ctx, mode: "plan" });
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(auditInsertValues).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_apply" }));
  });

  it("absent mode (default) behaves as commit: invalidates + audits success", async () => {
    await executeToolCall("create_revenue_stream", { name: "X" }, ctx);
    expect(revalidateTagMock).toHaveBeenCalled();
    expect(auditInsertValues).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });
});

describe("plan-mode safety for facade-bypassing mutations", () => {
  const ctx = { companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "conv1" };

  it("isDiffableMutationTool excludes scenario CRUD + investor, includes facade writes", () => {
    expect(__testables.isDiffableMutationTool("create_revenue_stream")).toBe(true);
    expect(__testables.isDiffableMutationTool("delete_funding_round")).toBe(true);
    expect(__testables.isDiffableMutationTool("update_grant_milestone")).toBe(true);
    expect(__testables.isDiffableMutationTool("create_scenario")).toBe(false);
    expect(__testables.isDiffableMutationTool("update_scenario")).toBe(false);
    expect(__testables.isDiffableMutationTool("delete_scenario")).toBe(false);
    expect(__testables.isDiffableMutationTool("create_funding_round_investor")).toBe(false);
    // every excluded tool must really be a mutation (keeps the set honest)
    for (const t of __testables.NON_FACADE_MUTATION_TOOLS) {
      expect(__testables.MUTATION_TOOLS.has(t)).toBe(true);
    }
  });

  it("plan mode on a non-facade mutation returns empty overrides and never runs the handler", async () => {
    const { scenarioHandlers } = await import("../scenarios");
    const out = await executeToolCall("create_scenario", { name: "X" }, { ...ctx, mode: "plan" });
    expect(JSON.parse(out)).toEqual({ planned: true, overrides: [] });
    expect(scenarioHandlers.create_scenario).not.toHaveBeenCalled();
  });

  it("commit mode on a non-facade mutation runs the handler as before", async () => {
    const { scenarioHandlers } = await import("../scenarios");
    (scenarioHandlers.create_scenario as ReturnType<typeof vi.fn>).mockClear();
    await executeToolCall("create_scenario", { name: "X" }, { ...ctx, mode: "commit" });
    expect(scenarioHandlers.create_scenario).toHaveBeenCalledOnce();
  });
});
