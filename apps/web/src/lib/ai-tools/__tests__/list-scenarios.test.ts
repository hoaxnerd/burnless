/**
 * Tests for the list_scenarios AI tool handler (worklog Plan 5).
 *
 * Mirrors the activate-scenario.test.ts harness (vi.mock, no PGLite) — the
 * @burnless/db client + getOverrideBreakdown query are mocked so the import graph
 * loads in isolation. The behavioral assertions match the plan: scenarios come
 * back with an override-diff headline + grouped changes, and a scenario with no
 * overrides reports "no changes from base".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockDbSelect, mockDbInsert, mockGetOverrideBreakdown } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(() => ({ values: () => ({ catch: () => undefined }) })),
  mockGetOverrideBreakdown: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

vi.mock("../../compute-dashboard", () => ({ computeDashboardData: vi.fn() }));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  scenarios: {
    id: "id",
    name: "name",
    source: "source",
    status: "status",
    companyId: "companyId",
    deletedAt: "deletedAt",
    createdAt: "createdAt",
  },
  scenarioOverrides: {},
  getOverrideBreakdown: mockGetOverrideBreakdown,
  aiToolAuditLogs: {},
}));

// Keep ../scenarios REAL (unit under test); stub every OTHER domain module
// index.ts imports so the import graph loads in isolation.
vi.mock("../headcount", () => ({ headcountSchemas: {}, headcountHandlers: {} }));
vi.mock("../revenue", () => ({ revenueSchemas: {}, revenueHandlers: {} }));
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

import { executeToolCall } from "../index";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Make db.select resolve to the given rows (handler awaits orderBy(...) last). */
function mockSelectRows(rows: Array<Record<string, unknown>>) {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => Promise.resolve(rows),
      }),
    }),
  });
}

const ctx = { companyId: "co-1", userId: "u-1", scenarioId: "sc-1", conversationId: "cv1" };
const scenarioId = "00000000-0000-0000-0000-000000000111";

describe("list_scenarios handler (Plan 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the company's scenarios with an override-diff headline", async () => {
    mockSelectRows([{ id: scenarioId, name: "Aggressive", source: "blank", status: "active" }]);
    mockGetOverrideBreakdown.mockResolvedValue([
      { scenarioId, entityType: "headcount", action: "create", count: 2 },
    ]);
    const raw = await executeToolCall("list_scenarios", {}, ctx);
    const r = JSON.parse(raw);
    expect(r.success).toBe(true);
    const me = r.scenarios.find((x: { id: string }) => x.id === scenarioId);
    expect(me).toBeDefined();
    expect(me.overrideCount).toBe(2);
    expect(me.headline).toContain("headcount");
    expect(me.changes).toContainEqual({ entityType: "headcount", action: "create", count: 2 });
  });

  it("reports a scenario with no overrides as 'no changes from base'", async () => {
    mockSelectRows([{ id: scenarioId, name: "Empty", source: "blank", status: "active" }]);
    mockGetOverrideBreakdown.mockResolvedValue([]);
    const raw = await executeToolCall("list_scenarios", {}, ctx);
    const r = JSON.parse(raw);
    const me = r.scenarios.find((x: { id: string }) => x.id === scenarioId);
    expect(me.overrideCount).toBe(0);
    expect(me.headline).toMatch(/no changes/i);
  });
});
