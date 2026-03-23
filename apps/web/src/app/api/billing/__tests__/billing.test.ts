import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockRequireRole, mockGetCompanyPlan } =
  vi.hoisted(() => ({
    mockRequireCompanyAccess: vi.fn(),
    mockRequireRole: vi.fn(),
    mockGetCompanyPlan: vi.fn(),
  }));

const {
  mockGetPaymentProvider,
  mockGetProviderByType,
  mockResolvePlanId,
  mockIsBillingEnabled,
} = vi.hoisted(() => ({
  mockGetPaymentProvider: vi.fn(),
  mockGetProviderByType: vi.fn(),
  mockResolvePlanId: vi.fn(),
  mockIsBillingEnabled: vi.fn(),
}));

const { mockGetPlanLimits } = vi.hoisted(() => ({
  mockGetPlanLimits: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  getCompanyPlan: mockGetCompanyPlan,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

/**
 * DB mock: uses a sequential results array.
 * Each db chain (select→from→…→terminal) consumes the next result.
 */
let dbResults: unknown[];
let dbResultIdx: number;

function nextDbResult() {
  return dbResults[dbResultIdx++] ?? [];
}

vi.mock("@burnless/db", () => {
  // Build chain that always resolves to the next result
  const makeChain = (): Record<string, (...args: unknown[]) => unknown> => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.where = self;
    chain.limit = self;
    chain.orderBy = self;
    chain.innerJoin = self;
    chain.set = self;
    chain.values = self;
    chain.returning = self;
    // Make the chain thenable so `await chain` resolves to the next result
    chain.then = (resolve: (...args: unknown[]) => unknown) => resolve(nextDbResult());
    return chain;
  };

  return {
    db: {
      select: () => makeChain(),
      insert: () => makeChain(),
      update: () => makeChain(),
      delete: () => makeChain(),
    },
    companies: { id: "id", billingProvider: "billingProvider", stripeCustomerId: "stripeCustomerId", stripeSubscriptionId: "stripeSubscriptionId", currency: "currency" },
    scenarios: { companyId: "companyId" },
    aiMessages: { conversationId: "conversationId", role: "role", createdAt: "createdAt" },
    aiConversations: { id: "id", companyId: "companyId" },
    users: { id: "id", email: "email", name: "name" },
    exportLogs: { companyId: "companyId", createdAt: "createdAt" },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/feature-gate", () => ({
  getPlanLimits: mockGetPlanLimits,
}));

vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000" },
}));

vi.mock("@/lib/payment", () => ({
  getPaymentProvider: mockGetPaymentProvider,
  getProviderByType: mockGetProviderByType,
  resolvePlanId: mockResolvePlanId,
  isBillingEnabled: mockIsBillingEnabled,
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

import { GET, POST } from "../route";

function jsonRequest(method: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request("http://localhost/api/billing", opts);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    dbResults = [];
    dbResultIdx = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(new Request("http://localhost/api/billing"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns free plan subscription status", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });
    mockGetCompanyPlan.mockResolvedValue("free");
    mockGetPlanLimits.mockReturnValue({
      maxScenarios: 1, maxAiMessages: 10, maxExports: 3,
    });
    mockIsBillingEnabled.mockReturnValue(false);

    // GET does: scenarioCount, aiMessageCount, company query
    dbResults = [
      [{ cnt: 0 }],   // scenario count
      [{ cnt: 0 }],   // AI message count
      [{ cnt: 0 }],   // export count
      [{              // company
        billingProvider: null, stripeCustomerId: null,
        stripeSubscriptionId: null, currency: "USD",
      }],
    ];

    const res = await GET(new Request("http://localhost/api/billing"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBe("free");
    expect(body.status).toBe("none");
    expect(body.seats).toBe(1);
    expect(body.usage.scenarios).toEqual({ used: 0, limit: 1 });
    expect(body.usage.aiMessages).toEqual({ used: 0, limit: 10 });
    expect(body.usage.exports).toEqual({ used: 0, limit: 3 });
  });

  it("returns active status for pro plan without billing provider", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockGetCompanyPlan.mockResolvedValue("pro");
    mockGetPlanLimits.mockReturnValue({
      maxScenarios: Infinity, maxAiMessages: Infinity, maxExports: Infinity,
    });
    mockIsBillingEnabled.mockReturnValue(false);

    dbResults = [
      [{ cnt: 3 }],    // scenario count
      [{ cnt: 15 }],   // AI messages
      [{ cnt: 0 }],    // export count
      [{               // company - no subscription
        billingProvider: null, stripeCustomerId: null,
        stripeSubscriptionId: null, currency: "USD",
      }],
    ];

    const res = await GET(new Request("http://localhost/api/billing"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBe("pro");
    expect(body.status).toBe("active");
    expect(body.usage.scenarios).toEqual({ used: 3, limit: -1 });
    expect(body.usage.aiMessages).toEqual({ used: 15, limit: -1 });
  });

  it("returns subscription details from Stripe when billing is enabled", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockGetCompanyPlan.mockResolvedValue("pro");
    mockGetPlanLimits.mockReturnValue({
      maxScenarios: Infinity, maxAiMessages: Infinity, maxExports: Infinity,
    });
    mockIsBillingEnabled.mockReturnValue(true);

    dbResults = [
      [{ cnt: 2 }],
      [{ cnt: 5 }],
      [{ cnt: 0 }],
      [{
        billingProvider: "stripe", stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_456", currency: "USD",
      }],
    ];

    const periodEnd = new Date("2026-04-22T00:00:00.000Z");
    const mockProvider = {
      getSubscription: vi.fn().mockResolvedValue({
        status: "active", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false,
      }),
    };
    mockGetProviderByType.mockReturnValue(mockProvider);

    const res = await GET(new Request("http://localhost/api/billing"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("active");
    expect(body.currentPeriodEnd).toBe(periodEnd.toISOString());
    expect(body.cancelAtPeriodEnd).toBe(false);
    expect(mockProvider.getSubscription).toHaveBeenCalledWith("sub_456");
  });

  it("degrades gracefully when subscription fetch fails", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockGetCompanyPlan.mockResolvedValue("pro");
    mockGetPlanLimits.mockReturnValue({
      maxScenarios: Infinity, maxAiMessages: Infinity, maxExports: Infinity,
    });
    mockIsBillingEnabled.mockReturnValue(true);

    dbResults = [
      [{ cnt: 0 }],
      [{ cnt: 0 }],
      [{ cnt: 0 }],
      [{
        billingProvider: "stripe", stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_gone", currency: "USD",
      }],
    ];
    mockGetProviderByType.mockReturnValue({
      getSubscription: vi.fn().mockRejectedValue(new Error("Deleted")),
    });

    const res = await GET(new Request("http://localhost/api/billing"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("none");
  });
});

describe("POST /api/billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    dbResults = [];
    dbResultIdx = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(jsonRequest("POST", { action: "checkout", plan: "pro" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await POST(jsonRequest("POST", { action: "checkout", plan: "pro" }));
    expect(res.status).toBe(403);
  });

  it("returns 503 when billing is not enabled", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(false);

    const res = await POST(jsonRequest("POST", { plan: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain("No billing provider configured");
  });

  it("returns 400 for invalid plan", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: null, stripeCustomerId: null,
      stripeSubscriptionId: null, currency: "USD",
    }]];
    mockGetPaymentProvider.mockReturnValue({ type: "stripe" });

    const res = await POST(jsonRequest("POST", { plan: "enterprise" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("Invalid plan");
  });

  it("returns 400 for portal action without customer", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: null, stripeCustomerId: null,
      stripeSubscriptionId: null, currency: "USD",
    }]];
    mockGetPaymentProvider.mockReturnValue({ type: "stripe" });

    const res = await POST(jsonRequest("POST", { action: "portal" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("No billing account found");
  });

  it("opens portal session for existing customer", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: "stripe", stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_456", currency: "USD",
    }]];

    const mockProvider = {
      type: "stripe",
      createPortalSession: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/portal" }),
    };
    mockGetPaymentProvider.mockReturnValue(mockProvider);

    const res = await POST(jsonRequest("POST", { action: "portal" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://billing.stripe.com/portal");
    expect(mockProvider.createPortalSession).toHaveBeenCalledWith(
      "cus_123", "http://localhost:3000/settings?tab=billing"
    );
  });

  it("returns 400 for cancel action without subscription", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: "stripe", stripeCustomerId: "cus_123",
      stripeSubscriptionId: null, currency: "USD",
    }]];
    mockGetPaymentProvider.mockReturnValue({ type: "stripe" });

    const res = await POST(jsonRequest("POST", { action: "cancel" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("No active subscription to cancel");
  });

  it("cancels subscription at period end", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: "stripe", stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_456", currency: "USD",
    }]];

    const periodEnd = new Date("2026-04-22T00:00:00.000Z");
    const mockProvider = {
      type: "stripe",
      cancelSubscription: vi.fn().mockResolvedValue(undefined),
      getSubscription: vi.fn().mockResolvedValue({
        cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd,
      }),
    };
    mockGetPaymentProvider.mockReturnValue(mockProvider);

    const res = await POST(jsonRequest("POST", { action: "cancel" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cancelAtPeriodEnd).toBe(true);
    expect(body.currentPeriodEnd).toBe(periodEnd.toISOString());
    expect(mockProvider.cancelSubscription).toHaveBeenCalledWith("sub_456", true);
  });

  it("reactivates cancelled subscription", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: "stripe", stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_456", currency: "USD",
    }]];

    const mockProvider = {
      type: "stripe",
      reactivateSubscription: vi.fn().mockResolvedValue(undefined),
      getSubscription: vi.fn().mockResolvedValue({ cancelAtPeriodEnd: false }),
    };
    mockGetPaymentProvider.mockReturnValue(mockProvider);

    const res = await POST(jsonRequest("POST", { action: "reactivate" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cancelAtPeriodEnd).toBe(false);
    expect(mockProvider.reactivateSubscription).toHaveBeenCalledWith("sub_456");
  });

  it("creates checkout session for new customer", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [
      [{  // company query
        billingProvider: null, stripeCustomerId: null,
        stripeSubscriptionId: null, currency: "USD",
      }],
      [{ email: "founder@startup.com", name: "Founder" }], // user email
      undefined, // update (persist customer)
    ];

    const mockProvider = {
      type: "stripe",
      createCustomer: vi.fn().mockResolvedValue({ id: "cus_new" }),
      createCheckout: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session" }),
    };
    mockGetPaymentProvider.mockReturnValue(mockProvider);
    mockResolvePlanId.mockReturnValue("price_pro_123");

    const res = await POST(jsonRequest("POST", { plan: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/session");
    expect(mockProvider.createCustomer).toHaveBeenCalledWith(
      "founder@startup.com", "Founder", "USD"
    );
    expect(mockProvider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_new", planId: "price_pro_123", currency: "USD",
      })
    );
  });

  it("creates checkout for existing customer without re-creating", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: "stripe", stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null, currency: "USD",
    }]];

    const mockProvider = {
      type: "stripe",
      createCustomer: vi.fn(),
      createCheckout: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/x" }),
    };
    mockGetPaymentProvider.mockReturnValue(mockProvider);
    mockResolvePlanId.mockReturnValue("price_team_456");

    const res = await POST(jsonRequest("POST", { plan: "team" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/x");
    expect(mockProvider.createCustomer).not.toHaveBeenCalled();
  });

  it("returns 503 when plan price is not configured", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: null, stripeCustomerId: null,
      stripeSubscriptionId: null, currency: "USD",
    }]];
    mockGetPaymentProvider.mockReturnValue({ type: "stripe" });
    mockResolvePlanId.mockReturnValue(null);

    const res = await POST(jsonRequest("POST", { plan: "pro" }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain("Price not configured");
  });

  it("returns 400 for reactivate without subscription", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockIsBillingEnabled.mockReturnValue(true);
    dbResults = [[{
      billingProvider: "stripe", stripeCustomerId: "cus_123",
      stripeSubscriptionId: null, currency: "USD",
    }]];
    mockGetPaymentProvider.mockReturnValue({ type: "stripe" });

    const res = await POST(jsonRequest("POST", { action: "reactivate" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("No subscription to reactivate");
  });
});
