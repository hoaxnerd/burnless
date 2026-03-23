import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockSelect, mockFrom, mockWhere, mockUpdate, mockSet, mockInsert, mockValues, mockOnConflictDoUpdate } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockUpdate: vi.fn(),
    mockSet: vi.fn(),
    mockInsert: vi.fn(),
    mockValues: vi.fn(),
    mockOnConflictDoUpdate: vi.fn(),
  }));

const { mockCheckAiFeatureAllowed, mockGetCompanyProviderConfig } = vi.hoisted(
  () => ({
    mockCheckAiFeatureAllowed: vi.fn().mockResolvedValue({ allowed: true }),
    mockGetCompanyProviderConfig: vi.fn().mockResolvedValue(null),
  })
);

const { mockGetDefaultScenario } = vi.hoisted(() => ({
  mockGetDefaultScenario: vi.fn().mockResolvedValue({
    id: "scenario-1",
    name: "Base Case",
    type: "base",
  }),
}));

const { mockBuildAiContext } = vi.hoisted(() => ({
  mockBuildAiContext: vi.fn().mockResolvedValue({
    snapshot: { company: { name: "Test Corp" } },
  }),
}));

const { mockGenerateInsights, mockGeneratePageInsights } = vi.hoisted(() => ({
  mockGenerateInsights: vi.fn().mockReturnValue([{ text: "Insight 1" }]),
  mockGeneratePageInsights: vi
    .fn()
    .mockResolvedValue([{ text: "Page insight 1" }]),
}));

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  insightInvalidations: {
    processedAt: "processedAt",
    lastMutationAt: "lastMutationAt",
    id: "id",
  },
  aiInsightCache: {
    companyId: "companyId",
    type: "type",
    key: "key",
  },
  scenarios: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  lte: vi.fn(),
}));

vi.mock("@burnless/ai", () => ({
  generateInsights: mockGenerateInsights,
  generatePageInsights: mockGeneratePageInsights,
}));

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: mockBuildAiContext,
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: mockCheckAiFeatureAllowed,
  getCompanyProviderConfig: mockGetCompanyProviderConfig,
}));

vi.mock("@/lib/data", () => ({
  getDefaultScenario: mockGetDefaultScenario,
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (handler: (...args: unknown[]) => unknown) => handler,
}));

// ── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(
  url: string,
  options?: RequestInit & { cronSecret?: string }
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.cronSecret
      ? { authorization: `Bearer ${options.cronSecret}` }
      : {}),
  };
  return new Request(url, {
    method: "POST",
    headers,
    ...options,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("POST /api/insights/batch-regenerate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    // Reset env
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");

    // Re-set mock defaults after resetAllMocks
    mockCheckAiFeatureAllowed.mockResolvedValue({ allowed: true });
    mockGetCompanyProviderConfig.mockResolvedValue(null);
    mockGetDefaultScenario.mockResolvedValue({
      id: "scenario-1",
      name: "Base Case",
      type: "base",
    });
    mockBuildAiContext.mockResolvedValue({
      snapshot: { company: { name: "Test Corp" } },
    });
    mockGenerateInsights.mockReturnValue([{ text: "Insight 1" }]);
    mockGeneratePageInsights.mockResolvedValue([{ text: "Page insight 1" }]);

    // DB chains
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]); // Default: no pending invalidations

    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    });
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it("returns 401 in production without valid CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { POST } = await import("../batch-regenerate/route");
    const res = await POST(
      makeRequest("http://localhost/api/insights/batch-regenerate")
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 in production with wrong CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { POST } = await import("../batch-regenerate/route");
    const res = await POST(
      makeRequest("http://localhost/api/insights/batch-regenerate", {
        cronSecret: "wrong-secret",
      })
    );
    expect(res.status).toBe(401);
  });

  it("allows access in development without CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const { POST } = await import("../batch-regenerate/route");
    const res = await POST(
      makeRequest("http://localhost/api/insights/batch-regenerate")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns empty results when no pending invalidations", async () => {
    mockWhere.mockResolvedValue([]);

    const { POST } = await import("../batch-regenerate/route");
    const res = await POST(
      makeRequest("http://localhost/api/insights/batch-regenerate")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.results).toEqual([]);
  });

  it("processes pending invalidations and returns results", async () => {
    mockWhere.mockResolvedValue([
      {
        id: "inv-1",
        companyId: "company-1",
        insightType: "dashboard",
        lastMutationAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);

    const { POST } = await import("../batch-regenerate/route");
    const res = await POST(
      makeRequest("http://localhost/api/insights/batch-regenerate")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBeGreaterThanOrEqual(1);
  });

  it("skips companies with AI features disabled", async () => {
    mockWhere.mockResolvedValue([
      {
        id: "inv-1",
        companyId: "company-blocked",
        insightType: "expense",
        lastMutationAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: false,
      reason: "AI disabled",
    });

    const { POST } = await import("../batch-regenerate/route");
    const res = await POST(
      makeRequest("http://localhost/api/insights/batch-regenerate")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe("skipped");
    expect(body.results[0].reason).toContain("AI disabled");
  });

  it("skips companies without a default scenario", async () => {
    mockWhere.mockResolvedValue([
      {
        id: "inv-1",
        companyId: "company-no-scenario",
        insightType: "revenue",
        lastMutationAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);
    mockGetDefaultScenario.mockResolvedValue(null);

    const { POST } = await import("../batch-regenerate/route");
    const res = await POST(
      makeRequest("http://localhost/api/insights/batch-regenerate")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe("skipped");
    expect(body.results[0].reason).toContain("No default scenario");
  });
});
