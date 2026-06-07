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
vi.mock("../scenarios", () => ({ scenarioSchemas: {}, scenarioHandlers: {} }));
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
