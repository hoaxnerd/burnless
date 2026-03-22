import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockInsert,
  mockValues,
  mockOnConflictDoUpdate,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
}));

const { mockCheckAiFeatureAllowed, mockGetAiFlags, mockGetCompanyProviderConfig } = vi.hoisted(() => ({
  mockCheckAiFeatureAllowed: vi.fn(),
  mockGetAiFlags: vi.fn(),
  mockGetCompanyProviderConfig: vi.fn(),
}));

const { mockGenerateInsights, mockGeneratePageInsights, mockResolveFeatureStatus } = vi.hoisted(() => ({
  mockGenerateInsights: vi.fn(),
  mockGeneratePageInsights: vi.fn(),
  mockResolveFeatureStatus: vi.fn(),
}));

const { mockGetDefaultScenario } = vi.hoisted(() => ({
  mockGetDefaultScenario: vi.fn(),
}));

const { mockBuildAiContext } = vi.hoisted(() => ({
  mockBuildAiContext: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
  scenarios: { id: "id", companyId: "companyId" },
  aiInsightCache: {
    companyId: "companyId",
    type: "type",
    key: "key",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@burnless/ai", () => ({
  generateInsights: mockGenerateInsights,
  generatePageInsights: mockGeneratePageInsights,
  resolveFeatureStatus: mockResolveFeatureStatus,
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: mockCheckAiFeatureAllowed,
  getAiFlags: mockGetAiFlags,
  getCompanyProviderConfig: mockGetCompanyProviderConfig,
}));

vi.mock("@/lib/data", () => ({
  getDefaultScenario: mockGetDefaultScenario,
}));

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: mockBuildAiContext,
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// ── Chain setup ──────────────────────────────────────────────────────────────

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

describe("GET /api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/insights"));
    expect(res.status).toBe(401);
  });

  it("returns empty insights when disabled", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetAiFlags.mockResolvedValue({
      masterEnabled: false,
      dataMode: "full",
      features: { insights: false },
    });
    mockResolveFeatureStatus.mockReturnValue({
      enabled: false,
      canGenerate: false,
      showCached: false,
    });

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/insights"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.insights).toEqual([]);
    expect(body.reason).toContain("disabled");
  });

  it("returns cached insights when available", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetAiFlags.mockResolvedValue({
      masterEnabled: true,
      dataMode: "show_cached",
      features: { insights: true },
    });
    mockResolveFeatureStatus.mockReturnValue({
      enabled: true,
      canGenerate: false,
      showCached: true,
    });

    const cachedAt = new Date();
    const expiresAt = new Date(Date.now() + 86400000);
    mockLimit.mockResolvedValue([
      {
        content: [{ type: "warning", title: "Low Runway", summary: "6 months left" }],
        updatedAt: cachedAt,
        expiresAt,
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/insights"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.insights).toHaveLength(1);
    expect(body.insights[0].title).toBe("Low Runway");
  });

  it("returns empty when no cache exists", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetAiFlags.mockResolvedValue({
      masterEnabled: true,
      dataMode: "full",
      features: { insights: true },
    });
    mockResolveFeatureStatus.mockReturnValue({
      enabled: true,
      canGenerate: true,
      showCached: true,
    });
    mockLimit.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/insights"));
    const body = await res.json();

    expect(body.insights).toEqual([]);
    expect(body.cached).toBe(true);
  });
});

describe("POST /api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns empty when AI features not allowed and not cached mode", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: false,
      reason: "Budget exceeded",
    });
    mockGetAiFlags.mockResolvedValue({
      masterEnabled: true,
      dataMode: "full",
      features: { insights: true },
    });
    mockResolveFeatureStatus.mockReturnValue({
      enabled: true,
      canGenerate: false,
      showCached: false,
    });

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    const body = await res.json();

    expect(body.insights).toEqual([]);
    expect(body.reason).toBe("Budget exceeded");
  });

  it("returns 404 when no scenario found", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockCheckAiFeatureAllowed.mockResolvedValue({ allowed: true });
    mockGetDefaultScenario.mockResolvedValue(null);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(404);
  });

  it("generates dashboard insights (deterministic)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockCheckAiFeatureAllowed.mockResolvedValue({ allowed: true });
    mockGetDefaultScenario.mockResolvedValue({ id: "s1", name: "Base", type: "base" });
    mockBuildAiContext.mockResolvedValue({
      snapshot: { keyMetrics: { runway: 8, burnRate: 50000 } },
      contextText: "",
    });
    mockGenerateInsights.mockReturnValue([
      { type: "warning", title: "Runway Alert", summary: "8 months" },
    ]);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({ page: "dashboard" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.insights).toHaveLength(1);
    expect(body.page).toBe("dashboard");
    expect(mockGenerateInsights).toHaveBeenCalled();
  });

  it("generates LLM page insights for expenses", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockCheckAiFeatureAllowed.mockResolvedValue({ allowed: true });
    mockGetDefaultScenario.mockResolvedValue({ id: "s1", name: "Base", type: "base" });
    mockBuildAiContext.mockResolvedValue({
      snapshot: { keyMetrics: {} },
      contextText: "",
    });
    mockGetCompanyProviderConfig.mockResolvedValue(null);
    mockGeneratePageInsights.mockResolvedValue([
      { type: "info", title: "Top Expense", summary: "AWS is 40% of opex" },
    ]);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({ page: "expenses" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.page).toBe("expenses");
    expect(mockGeneratePageInsights).toHaveBeenCalled();
  });

  it("gracefully handles LLM failure", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockCheckAiFeatureAllowed.mockResolvedValue({ allowed: true });
    mockGetDefaultScenario.mockResolvedValue({ id: "s1", name: "Base", type: "base" });
    mockBuildAiContext.mockResolvedValue({
      snapshot: { keyMetrics: {} },
      contextText: "",
    });
    mockGetCompanyProviderConfig.mockResolvedValue(null);
    mockGeneratePageInsights.mockRejectedValue(new Error("LLM timeout"));

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({ page: "revenue" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.insights).toEqual([]);
  });
});
