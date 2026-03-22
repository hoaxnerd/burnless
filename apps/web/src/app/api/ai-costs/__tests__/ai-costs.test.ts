import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockGetBudgetStatus } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetBudgetStatus: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  getBudgetStatus: mockGetBudgetStatus,
}));

const { mockSelect, mockFrom, mockWhere, mockGroupBy, mockOrderBy } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockGroupBy: vi.fn(),
  mockOrderBy: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  aiUsageLogs: {
    feature: "feature",
    tier: "tier",
    inputTokens: "inputTokens",
    outputTokens: "outputTokens",
    estimatedCostMicros: "estimatedCostMicros",
    durationMs: "durationMs",
    companyId: "companyId",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

import { GET } from "../route";

describe("GET /api/ai-costs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "owner",
    });
    mockGetBudgetStatus.mockResolvedValue({
      monthlyLimitMicros: 10_000_000,
      usedMicros: 2_500_000,
      remainingMicros: 7_500_000,
      percentUsed: 25,
    });

    // First call: featureBreakdown query chain
    // Second call: dailySpend query chain
    let callCount = 0;
    mockSelect.mockImplementation(() => ({ from: mockFrom }));
    mockFrom.mockImplementation(() => ({ where: mockWhere }));
    mockWhere.mockImplementation(() => ({ groupBy: mockGroupBy }));
    mockGroupBy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // featureBreakdown — no orderBy
        return Promise.resolve([]);
      }
      // dailySpend — has orderBy
      return { orderBy: mockOrderBy };
    });
    mockOrderBy.mockResolvedValue([]);
  });

  it("returns cost data with empty usage", async () => {
    const req = new Request("http://localhost:3000/api/ai-costs");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.period.days).toBe(30);
    expect(body.totalCostMicros).toBe(0);
    expect(body.totalCostUSD).toBe(0);
    expect(body.totalRequests).toBe(0);
    expect(body.featureBreakdown).toEqual([]);
    expect(body.dailySpend).toEqual([]);
    expect(body.budget).toBeDefined();
  });

  it("returns cost data with feature breakdown", async () => {
    let callCount = 0;
    mockGroupBy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([
          { feature: "chat", tier: "standard", totalInputTokens: 1000, totalOutputTokens: 500, totalCostMicros: 50000, requestCount: 10, avgDurationMs: 200 },
          { feature: "insights", tier: "premium", totalInputTokens: 2000, totalOutputTokens: 1000, totalCostMicros: 150000, requestCount: 5, avgDurationMs: 500 },
        ]);
      }
      return { orderBy: mockOrderBy };
    });
    mockOrderBy.mockResolvedValue([
      { date: "2026-03-21", totalCostMicros: 100000, requestCount: 8 },
      { date: "2026-03-22", totalCostMicros: 100000, requestCount: 7 },
    ]);

    const req = new Request("http://localhost:3000/api/ai-costs");
    const res = await GET(req);
    const body = await res.json();

    expect(body.totalCostMicros).toBe(200000);
    expect(body.totalCostUSD).toBe(0.2);
    expect(body.totalRequests).toBe(15);
    expect(body.featureBreakdown).toHaveLength(2);
    expect(body.featureBreakdown[0].costUSD).toBe(0.05);
    expect(body.featureBreakdown[0].percentOfTotal).toBe(25);
    expect(body.dailySpend).toHaveLength(2);
    expect(body.dailySpend[0].costUSD).toBe(0.1);
  });

  it("respects custom days parameter capped at 90", async () => {
    const req = new Request("http://localhost:3000/api/ai-costs?days=120");
    const res = await GET(req);
    const body = await res.json();

    expect(body.period.days).toBe(90);
  });

  it("supports 7-day period", async () => {
    const req = new Request("http://localhost:3000/api/ai-costs?days=7");
    const res = await GET(req);
    const body = await res.json();

    expect(body.period.days).toBe(7);
  });

  it("returns auth error when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = new Request("http://localhost:3000/api/ai-costs");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
