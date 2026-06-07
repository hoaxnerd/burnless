/**
 * Tests for the activate_scenario AI tool handler + create_scenario name field
 * (worklog Plan 5).
 *
 * Uses vi.mock to avoid PGLite setup (consistent with the other web ai-tools
 * tests — see funding.test.ts). The behavioral assertions match the plan: an
 * owned scenario activates (success + scenarioId + name), a foreign scenario
 * fails, and create_scenario now returns its name.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

// scenarios.ts imports compute-dashboard (for get_scenario_comparison), which
// pulls the next-auth chain into the test runtime — stub it so the import graph
// loads in isolation (consistent with expenses.test.ts).
vi.mock("../../compute-dashboard", () => ({ computeDashboardData: vi.fn() }));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  scenarios: {
    id: "id",
    name: "name",
    companyId: "companyId",
    deletedAt: "deletedAt",
  },
  aiToolAuditLogs: {},
}));

// Keep ../scenarios REAL (it is the unit under test); stub every OTHER domain
// module index.ts imports so the import graph loads in isolation without pulling
// the next-auth chain (mirrors execute-mode.test.ts).
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

/** Make db.select resolve to the given rows (handler awaits the where(...) directly). */
function mockSelectRows(rows: Array<Record<string, unknown>>) {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  });
}

/** db.insert handles BOTH the create_scenario write (.values().returning()) and
 *  the audit log write (.values().catch()). */
function mockInsert(returningRow: Record<string, unknown>) {
  mockDbInsert.mockReturnValue({
    values: () => ({
      returning: () => Promise.resolve([returningRow]),
      catch: () => undefined,
    }),
  });
}

const ctx = { companyId: "co-1", userId: "u-1", scenarioId: "sc-1", conversationId: "cv1" };
const ownedScenarioId = "00000000-0000-0000-0000-000000000111";

describe("activate_scenario handler (Plan 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert({ id: "sc-new", name: "Activation QA" });
  });

  it("returns success + scenarioId + name for an owned scenario", async () => {
    mockSelectRows([{ id: ownedScenarioId, name: "Aggressive" }]);
    const raw = await executeToolCall("activate_scenario", { scenarioId: ownedScenarioId }, ctx);
    const r = JSON.parse(raw);
    expect(r.success).toBe(true);
    expect(r.scenarioId).toBe(ownedScenarioId);
    expect(typeof r.name).toBe("string");
  });

  it("fails for a scenario from another company", async () => {
    mockSelectRows([]); // ownership filter matches nothing
    const raw = await executeToolCall(
      "activate_scenario",
      { scenarioId: "00000000-0000-0000-0000-000000000999" },
      ctx,
    );
    const r = JSON.parse(raw);
    expect(r.success).toBe(false);
  });

  it("create_scenario result includes name", async () => {
    mockInsert({ id: "sc-new", name: "Activation QA" });
    const raw = await executeToolCall("create_scenario", { name: "Activation QA" }, ctx);
    const r = JSON.parse(raw);
    expect(r.success).toBe(true);
    expect(r.name).toBe("Activation QA");
  });
});
