import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockInsert,
  mockValues,
  mockReturning,
  mockUpdate,
  mockSet,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
}));

const { mockGetBudgetStatus } = vi.hoisted(() => ({
  mockGetBudgetStatus: vi.fn(),
}));

// ── Mock modules ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  aiFeatureFlags: {
    companyId: "companyId",
    masterEnabled: "masterEnabled",
    dataMode: "dataMode",
    features: "features",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@burnless/ai", () => ({
  DEFAULT_AI_FLAGS: {
    masterEnabled: true,
    dataMode: "full",
    features: {
      onboarding: true,
      chat: true,
      insights: true,
      uiPersonalization: true,
      autoCategorization: true,
      weeklyDigest: true,
    },
  },
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  getBudgetStatus: mockGetBudgetStatus,
}));

// ── Chain setup ──────────────────────────────────────────────────────────────

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });

mockInsert.mockReturnValue({ values: mockValues });
mockValues.mockReturnValue({ returning: mockReturning });

mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });
// For PATCH, where returns returning
mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });

// ── Tests ────────────────────────────────────────────────────────────────────

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

describe("GET /api/ai-features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/ai-features"));
    expect(res.status).toBe(401);
  });

  it("returns existing flags with budget", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockLimit.mockResolvedValue([
      {
        masterEnabled: true,
        dataMode: "full",
        features: { onboarding: true, chat: true, insights: true, uiPersonalization: true, autoCategorization: true, weeklyDigest: true },
        monthlyBudgetCents: 5000,
        aiProvider: "anthropic",
        aiApiKey: "sk-ant-1234567890abcdef",
        aiModel: null,
        aiBaseUrl: null,
      },
    ]);
    mockGetBudgetStatus.mockResolvedValue({
      percentUsed: 25,
      warning: false,
      exceeded: false,
    });

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/ai-features"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.masterEnabled).toBe(true);
    expect(body.dataMode).toBe("full");
    expect(body.budget).toBeDefined();
    // API key should be masked
    expect(body.aiApiKey).toContain("••••••••");
    expect(body.aiApiKey).not.toBe("sk-ant-1234567890abcdef");
  });

  it("creates default flags when none exist", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockLimit.mockResolvedValue([]); // No existing flags
    mockReturning.mockResolvedValue([
      {
        masterEnabled: true,
        dataMode: "full",
        features: { onboarding: true, chat: true, insights: true, uiPersonalization: true, autoCategorization: true, weeklyDigest: true },
        monthlyBudgetCents: 5000,
      },
    ]);
    mockGetBudgetStatus.mockResolvedValue({ percentUsed: 0, warning: false, exceeded: false });

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/ai-features"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.masterEnabled).toBe(true);
  });
});

describe("PATCH /api/ai-features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      new Request("http://localhost/api/ai-features", {
        method: "PATCH",
        body: JSON.stringify({ masterEnabled: false }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ ...CTX, role: "viewer" });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    );

    const { PATCH } = await import("../route");
    const res = await PATCH(
      new Request("http://localhost/api/ai-features", {
        method: "PATCH",
        body: JSON.stringify({ masterEnabled: false }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);

    const { PATCH } = await import("../route");
    const res = await PATCH(
      new Request("http://localhost/api/ai-features", {
        method: "PATCH",
        body: JSON.stringify({ masterEnabled: "not-boolean" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("updates master switch successfully", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);
    // getOrCreateFlags finds existing
    mockLimit.mockResolvedValue([
      {
        masterEnabled: true,
        dataMode: "full",
        features: { onboarding: true, chat: true, insights: true, uiPersonalization: true, autoCategorization: true, weeklyDigest: true },
        monthlyBudgetCents: 5000,
        aiProvider: null,
        aiApiKey: null,
        aiModel: null,
        aiBaseUrl: null,
      },
    ]);
    // update().set().where().returning()
    mockReturning.mockResolvedValue([
      {
        masterEnabled: false,
        dataMode: "full",
        features: { onboarding: true, chat: true, insights: true, uiPersonalization: true, autoCategorization: true, weeklyDigest: true },
        monthlyBudgetCents: 5000,
        aiProvider: null,
        aiApiKey: null,
        aiModel: null,
        aiBaseUrl: null,
      },
    ]);
    mockGetBudgetStatus.mockResolvedValue({ percentUsed: 0, warning: false, exceeded: false });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      new Request("http://localhost/api/ai-features", {
        method: "PATCH",
        body: JSON.stringify({ masterEnabled: false }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.masterEnabled).toBe(false);
  });

  it("validates provider must be one of anthropic/openai/openrouter", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);

    const { PATCH } = await import("../route");
    const res = await PATCH(
      new Request("http://localhost/api/ai-features", {
        method: "PATCH",
        body: JSON.stringify({ aiProvider: "invalid_provider" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("validates monthlyBudgetCents range (0–1,000,000)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);

    const { PATCH } = await import("../route");
    const res = await PATCH(
      new Request("http://localhost/api/ai-features", {
        method: "PATCH",
        body: JSON.stringify({ monthlyBudgetCents: 2_000_000 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("validates data mode enum", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);

    const { PATCH } = await import("../route");
    const res = await PATCH(
      new Request("http://localhost/api/ai-features", {
        method: "PATCH",
        body: JSON.stringify({ dataMode: "invalid_mode" }),
      })
    );
    expect(res.status).toBe(400);
  });
});
