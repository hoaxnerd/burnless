import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockRequireCompanyAccess, mockRequireRole, mockRequirePlanFeature } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
  mockRequirePlanFeature: vi.fn().mockResolvedValue(null),
}));

const { mockApplyRateLimit } = vi.hoisted(() => ({
  mockApplyRateLimit: vi.fn().mockResolvedValue(null),
}));

const { mockCheckAiFeatureAllowed } = vi.hoisted(() => ({
  mockCheckAiFeatureAllowed: vi.fn().mockResolvedValue({ allowed: true }),
}));

const { mockGetDefaultScenario, mockGetRevenueStreams, mockGetForecastLines } =
  vi.hoisted(() => ({
    mockGetDefaultScenario: vi.fn(),
    mockGetRevenueStreams: vi.fn().mockResolvedValue([]),
    mockGetForecastLines: vi.fn().mockResolvedValue([]),
  }));

const { mockComputeDashboardData } = vi.hoisted(() => ({
  mockComputeDashboardData: vi.fn(),
}));

const { mockSelect, mockSelectFrom, mockSelectWhere, mockInsert, mockValues, mockReturning } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
}));

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  requirePlanFeature: mockRequirePlanFeature,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  parseBody: async (
    req: Request,
    schema: { parse: (d: unknown) => unknown }
  ) => {
    try {
      const body = await req.json();
      return { data: schema.parse(body) };
    } catch {
      return {
        error: NextResponse.json(
          { error: "Validation failed" },
          { status: 400 }
        ),
      };
    }
  },
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: mockApplyRateLimit,
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: mockCheckAiFeatureAllowed,
}));

vi.mock("@/lib/data", () => ({
  getDefaultScenario: mockGetDefaultScenario,
  getRevenueStreams: mockGetRevenueStreams,
  getForecastLines: mockGetForecastLines,
}));

vi.mock("@/lib/compute-dashboard", () => ({
  computeDashboardData: mockComputeDashboardData,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect, insert: mockInsert },
  scenarios: { companyId: "companyId", deletedAt: "deletedAt" },
  forecastLines: {},
  revenueStreams: {},
}));

const { mockSeriesToArray } = vi.hoisted(() => ({
  mockSeriesToArray: vi.fn(),
}));

vi.mock("@burnless/engine", () => ({
  seriesToArray: mockSeriesToArray,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  sql: Object.assign(vi.fn(() => "count(*)"), { raw: vi.fn() }),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

function postBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("POST /api/scenarios/ai-generate", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: rate limit passes
    mockApplyRateLimit.mockResolvedValue(null);

    // Default: authenticated with editor role
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

    // Default: AI allowed
    mockCheckAiFeatureAllowed.mockResolvedValue({ allowed: true });

    // Default: base scenario exists
    mockGetDefaultScenario.mockResolvedValue({
      id: "scenario-1",
      name: "Base Case",
      type: "base",
    });

    // Default: forecast lines and revenue streams
    mockGetForecastLines.mockResolvedValue([]);
    mockGetRevenueStreams.mockResolvedValue([]);

    // Default: seriesToArray returns mock data
    mockSeriesToArray.mockReturnValue([
      { month: "2026-01", value: 10000 },
      { month: "2026-02", value: 12000 },
    ]);

    // Default: dashboard data
    mockComputeDashboardData.mockResolvedValue({
      totalRevenue: new Map(),
      totalExpenses: new Map(),
      metrics: {},
    });

    // Default: select chain (for COUNT(*) feature gate)
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockResolvedValue([{ count: 1 }]);
    mockRequirePlanFeature.mockResolvedValue(null);

    // Default: insert chain
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([
      { id: "new-scenario-1", name: "Best Case (AI Generated)", type: "best" },
    ]);
  });

  it("returns 429 when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "Rate limited" }, { status: 429 })
    );

    const { POST } = await import("../ai-generate/route");
    const res = await POST(
      makeRequest("http://localhost/api/scenarios/ai-generate", postBody({}))
    );
    expect(res.status).toBe(429);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { POST } = await import("../ai-generate/route");
    const res = await POST(
      makeRequest("http://localhost/api/scenarios/ai-generate", postBody({}))
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not editor", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const { POST } = await import("../ai-generate/route");
    const res = await POST(
      makeRequest("http://localhost/api/scenarios/ai-generate", postBody({}))
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when AI features disabled", async () => {
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: false,
      reason: "AI disabled",
    });

    const { POST } = await import("../ai-generate/route");
    const res = await POST(
      makeRequest("http://localhost/api/scenarios/ai-generate", postBody({}))
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("AI features are disabled");
  });

  it("returns 404 when no base scenario exists", async () => {
    mockGetDefaultScenario.mockResolvedValue(null);

    const { POST } = await import("../ai-generate/route");
    const res = await POST(
      makeRequest("http://localhost/api/scenarios/ai-generate", postBody({}))
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("No base scenario found");
  });

  it("returns success with created scenarios for best_worst type", async () => {
    const { POST } = await import("../ai-generate/route");
    const res = await POST(
      makeRequest(
        "http://localhost/api/scenarios/ai-generate",
        postBody({ type: "best_worst" })
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.baseScenario.id).toBe("scenario-1");
    expect(body.derivedFrom).toBeDefined();
    expect(body.derivedFrom.avgMonthlyGrowth).toBeDefined();
  });

  it("defaults to best_worst type when not specified", async () => {
    const { POST } = await import("../ai-generate/route");
    const res = await POST(
      makeRequest(
        "http://localhost/api/scenarios/ai-generate",
        postBody({})
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
