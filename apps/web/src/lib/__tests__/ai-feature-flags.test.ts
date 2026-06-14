import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Credit-enforcement billing bypass — Spec S1 §5.
 *
 * Credits are a billing concept. When billing is off (self_host, or no payment
 * provider configured) checkAiFeatureAllowed must NOT throttle at a plan's credit
 * cap. When billing is on (cloud + payment provider) the over-cap block stands.
 *
 * @/lib/capabilities is kept REAL (it reads process.env); DB and api-helpers are
 * mocked. The DB select() is a chainable thenable that yields queued rows in call
 * order: first the aiFeatureFlags row (getAiFlags), then the usage-sum row
 * (getMonthlyCreditsUsed).
 */

// --- DB mock: chainable, returns queued results in FIFO order -------------
let dbResultQueue: unknown[] = [];
vi.mock("@burnless/db", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    const ret = () => chain;
    chain.from = ret;
    chain.where = ret;
    chain.limit = ret;
    // awaitable: resolves to the next queued result
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(dbResultQueue.shift()).then(resolve);
    return chain;
  };
  return {
    db: { select: vi.fn(() => makeChain()) },
    aiFeatureFlags: {},
    aiUsageLogs: { estimatedCostMicros: {}, companyId: {}, createdAt: {} },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

// getCompanyPlan → 'free' (smallest credit allocation)
vi.mock("../api-helpers", () => ({
  getCompanyPlan: vi.fn().mockResolvedValue("free"),
}));

// Mock @burnless/ai so the test is isolated from real plan config.
vi.mock("@burnless/ai", () => ({
  DEFAULT_AI_FLAGS: {
    masterEnabled: true,
    dataMode: "full",
    writeMode: "confirm",
    features: {},
    companionName: "Companion",
  },
  canFeatureCallLlm: () => true,
  getPlan: () => ({
    monthlyAiCredits: 500,
    name: "Free",
    upgradeTarget: "pro",
  }),
}));

import { checkAiFeatureAllowed } from "../ai-feature-flags";

// An aiFeatureFlags row: AI on, feature on → falls through to credits.
function flagsRow() {
  return {
    masterEnabled: true,
    dataMode: "full",
    writeMode: "confirm",
    features: { chat: true },
    companionName: "Companion",
  };
}

// Usage-sum row from getMonthlyCreditsUsed; micros → way over the 500-credit cap.
function overCapUsageRow() {
  // 500 credits = 500_000 micros; 9_000_000 micros = 9000 credits used.
  return { totalMicros: 9_000_000 };
}

describe("checkAiFeatureAllowed — credit enforcement billing bypass (S1 §5)", () => {
  const ORIG_ENV = process.env;
  beforeEach(() => {
    dbResultQueue = [[flagsRow()], [overCapUsageRow()]];
  });
  afterEach(() => {
    process.env = ORIG_ENV;
    vi.clearAllMocks();
  });

  it("self_host (billing off): allows even when over the credit cap", async () => {
    // self_host: no BURNLESS_DEPLOYMENT, no payment provider → billing off
    process.env = { ...ORIG_ENV };
    delete process.env.BURNLESS_DEPLOYMENT;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    // Only the flags row is consumed before the bypass returns; usage row unused.
    dbResultQueue = [[flagsRow()]];

    const result = await checkAiFeatureAllowed("company-1", "chat");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("cloud (billing on): still blocks when over the credit cap", async () => {
    process.env = {
      ...ORIG_ENV,
      BURNLESS_DEPLOYMENT: "cloud",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    };

    const result = await checkAiFeatureAllowed("company-1", "chat");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("AI credits exhausted");
    expect(result.creditStatus?.exceeded).toBe(true);
  });

  it("cloud (billing on): allows when under the credit cap", async () => {
    process.env = {
      ...ORIG_ENV,
      BURNLESS_DEPLOYMENT: "cloud",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    };
    // 100_000 micros = 100 credits used, under the 500 cap.
    dbResultQueue = [[flagsRow()], [{ totalMicros: 100_000 }]];

    const result = await checkAiFeatureAllowed("company-1", "chat");
    expect(result.allowed).toBe(true);
    expect(result.creditStatus?.exceeded).toBe(false);
  });
});
