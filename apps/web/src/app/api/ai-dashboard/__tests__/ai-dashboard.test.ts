import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole, mockGetBudgetStatus } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn(),
  mockGetBudgetStatus: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  getBudgetStatus: mockGetBudgetStatus,
}));

const { mockGetFeatureTierMap, mockGetFeatureProviderMap, mockGetAllProviderHealth } = vi.hoisted(() => ({
  mockGetFeatureTierMap: vi.fn(),
  mockGetFeatureProviderMap: vi.fn(),
  mockGetAllProviderHealth: vi.fn(),
}));

vi.mock("@burnless/ai", () => ({
  getFeatureTierMap: mockGetFeatureTierMap,
  getFeatureProviderMap: mockGetFeatureProviderMap,
  getAllProviderHealth: mockGetAllProviderHealth,
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
    provider: "provider",
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

describe("GET /api/ai-dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null); // no error = authorized
    mockGetBudgetStatus.mockResolvedValue({
      monthlyLimitMicros: 10_000_000,
      usedMicros: 500_000,
      remainingMicros: 9_500_000,
      percentUsed: 5,
    });
    mockGetFeatureTierMap.mockReturnValue({ chat: "standard", insights: "premium" });
    mockGetFeatureProviderMap.mockReturnValue({ chat: "anthropic", insights: "openai" });
    mockGetAllProviderHealth.mockReturnValue({
      anthropic: { healthy: true, circuitOpen: false },
      openai: { healthy: true, circuitOpen: false },
    });

    // DB chain for Promise.all — select/from/where/groupBy are called multiple times
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ groupBy: mockGroupBy });
    mockGroupBy.mockImplementation(() => {
      // Return a thenable that also has .orderBy
      const result: any = Promise.resolve([]);
      result.orderBy = mockOrderBy;
      return result;
    });
    mockOrderBy.mockResolvedValue([]);
  });

  it("returns full dashboard data for admin", async () => {
    const req = new Request("http://localhost:3000/api/ai-dashboard");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.period.days).toBe(30);
    expect(body.summary).toBeDefined();
    expect(body.summary.totalCostMicros).toBe(0);
    expect(body.summary.totalCostUSD).toBe(0);
    expect(body.budget).toBeDefined();
    expect(body.providerHealth).toBeDefined();
    expect(body.routing.featureTiers).toEqual({ chat: "standard", insights: "premium" });
    expect(body.routing.featureProviders).toEqual({ chat: "anthropic", insights: "openai" });
  });

  it("returns auth error when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = new Request("http://localhost:3000/api/ai-dashboard");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns forbidden for non-admin users", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = new Request("http://localhost:3000/api/ai-dashboard");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("respects custom days parameter", async () => {
    const req = new Request("http://localhost:3000/api/ai-dashboard?days=7");
    const res = await GET(req);
    const body = await res.json();

    expect(body.period.days).toBe(7);
  });

  it("caps days at 90", async () => {
    const req = new Request("http://localhost:3000/api/ai-dashboard?days=365");
    const res = await GET(req);
    const body = await res.json();

    expect(body.period.days).toBe(90);
  });

  it("includes feature breakdown with cost percentages", async () => {
    mockGroupBy.mockImplementationOnce(() => {
      return Promise.resolve([
        { feature: "chat", tier: "standard", provider: "anthropic", totalInputTokens: 5000, totalOutputTokens: 2000, totalCostMicros: 300000, requestCount: 20, avgDurationMs: 150, p50DurationMs: 120, p95DurationMs: 400, maxDurationMs: 800 },
        { feature: "insights", tier: "premium", provider: "openai", totalInputTokens: 10000, totalOutputTokens: 5000, totalCostMicros: 700000, requestCount: 10, avgDurationMs: 500, p50DurationMs: 450, p95DurationMs: 900, maxDurationMs: 1200 },
      ]);
    });

    const req = new Request("http://localhost:3000/api/ai-dashboard");
    const res = await GET(req);
    const body = await res.json();

    expect(body.summary.totalCostMicros).toBe(1000000);
    expect(body.summary.totalCostUSD).toBe(1);
    expect(body.summary.totalRequests).toBe(30);
    expect(body.featureBreakdown).toHaveLength(2);
    expect(body.featureBreakdown[0].percentOfTotal).toBe(30);
    expect(body.featureBreakdown[1].percentOfTotal).toBe(70);
  });
});
