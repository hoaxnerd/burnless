import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: async () => ({ companyId: "co-auto", userId: "u1", role: "owner" }),
  errorResponse: (m: string, s: number) => new Response(JSON.stringify({ error: m }), { status: s }),
  withErrorHandler: (fn: unknown) => fn,
}));
vi.mock("@/lib/api-rate-limit", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: async () => ({ allowed: true }),
  getAiFlags: async () => ({}),
  getCompanyProviderConfig: async () => ({}),
}));
vi.mock("@burnless/ai", () => ({
  resolveFeatureStatus: () => ({ enabled: true, showCached: true, canGenerate: true }),
  generatePageInsights: vi.fn(async () => [{ id: "x" }]),
}));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: () => {} }));
vi.mock("@/lib/build-ai-context", () => ({ buildAiContext: async () => ({ snapshot: {} }) }));
vi.mock("@/lib/data", () => ({ getDefaultScenario: async () => ({ id: "s1", name: "Base", source: "base" }) }));

const freshness = { needsRegeneration: true, dataChangedAt: Date.now(), graceRemaining: null };
vi.mock("@/lib/data-mutation-tracker", () => ({
  MUTATION_GRACE_PERIOD_MS: 300000,
  checkInsightFreshness: vi.fn(async () => freshness),
}));
const lock = { acquireRegenLock: vi.fn(async () => true) };
vi.mock("@/lib/insight-regen-lock", () => lock);

const cacheRow = { content: [{ id: "old" }], updatedAt: new Date(0), staleAt: null, staleReason: null, expiresAt: new Date() };
vi.mock("@burnless/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [cacheRow] }) }) }),
        insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }) },
  scenarios: {}, aiInsightCache: { companyId: {}, type: {}, key: {} },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }));

beforeEach(() => { vi.clearAllMocks(); freshness.needsRegeneration = true; });

async function post(body: object) {
  const { POST } = await import("../route");
  return (POST as (r: Request) => Promise<Response>)(
    new Request("http://t/api/insights", { method: "POST", body: JSON.stringify(body) })
  );
}

describe("POST /api/insights auto path", () => {
  it("regenerates when stale + lock acquired", async () => {
    const res = await post({ page: "expenses", auto: true });
    const json = await res.json();
    expect(lock.acquireRegenLock).toHaveBeenCalledWith("co-auto", "expenses");
    expect(json.skippedReason).toBeUndefined();
  });

  it("serves cached without generating when not due", async () => {
    freshness.needsRegeneration = false;
    const res = await post({ page: "expenses", auto: true });
    const json = await res.json();
    expect(json.skippedReason).toBe("auto_not_due");
    expect(lock.acquireRegenLock).not.toHaveBeenCalled();
  });

  it("serves cached when the dedupe lock is held", async () => {
    lock.acquireRegenLock.mockResolvedValueOnce(false);
    const res = await post({ page: "expenses", auto: true });
    const json = await res.json();
    expect(json.skippedReason).toBe("regen_locked");
  });
});
