/**
 * Finance domain module parity tests (A3a-2).
 *
 * Asserts:
 * - financeDomainModule.core === true
 * - financeDomainModule.tools deep-equals getFinancialTools()
 * - getActiveTools({companyId}) deep-equals getFinancialTools()  (only finance registered)
 * - getActiveMcpExposedTools deep-equals getMcpExposedTools()
 *
 * These are the ZERO BEHAVIOR CHANGE proofs for A3a-2.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the modules that finance.ts pulls in (DB/Next dependencies) ──────────

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: vi.fn(async () => ({
    snapshot: {},
    contextText: "mocked context",
    nowContext: { iso: "2026-01-01T00:00", timezone: "UTC" },
  })),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

vi.mock("@burnless/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ catch: vi.fn() })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
  },
  aiToolAuditLogs: {},
  aiFeatureFlags: {},
  companies: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
}));

// Mock all ai-tools sub-modules that index.ts imports
vi.mock("@/lib/ai-tools/scenarios", () => ({ scenarioSchemas: {}, scenarioHandlers: {} }));
vi.mock("@/lib/ai-tools/headcount", () => ({ headcountSchemas: {}, headcountHandlers: {} }));
vi.mock("@/lib/ai-tools/revenue", () => ({ revenueSchemas: {}, revenueHandlers: {} }));
vi.mock("@/lib/ai-tools/funding", () => ({
  createFundingRound: vi.fn(),
  updateFundingRound: vi.fn(),
  deleteFundingRound: vi.fn(),
  addFundingRoundInvestor: vi.fn(),
  markGrantMilestoneHit: vi.fn(),
  modelDilution: vi.fn(),
}));
vi.mock("@/lib/ai-tools/forecasting", () => ({ forecastingSchemas: {}, forecastingHandlers: {} }));
vi.mock("@/lib/ai-tools/analytics", () => ({ analyticsSchemas: {}, analyticsHandlers: {} }));
vi.mock("@/lib/ai-tools/web-search", () => ({ webSearchSchemas: {}, webSearchHandlers: {} }));
vi.mock("@/lib/ai-tools/web-scraping", () => ({ webScrapingSchemas: {}, webScrapingHandlers: {} }));
vi.mock("@/lib/ai-tools/genui-display", () => ({ genuiDisplaySchemas: {}, genuiDisplayHandlers: {} }));
vi.mock("@/lib/ai-tools/transactions", () => ({ transactionSchemas: {}, transactionHandlers: {} }));
vi.mock("@/lib/ai-tools/mcp-describe", () => ({ describeMcpToolAction: vi.fn(() => null) }));
vi.mock("@/lib/ai-tools/resolve-tool-scenario", () => ({ resolveToolScenario: vi.fn() }));

// capabilities mock: finance is core → isDomainEnabled always returns true
vi.mock("@/lib/capabilities", () => ({
  isDomainEnabled: vi.fn(async () => true),
  requireDomainEnabled: vi.fn(async () => null),
  getCapabilities: vi.fn(() => ({})),
  requireCapability: vi.fn(() => null),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("financeDomainModule — structural", () => {
  it("has core:true", async () => {
    const { financeDomainModule } = await import("../finance");
    expect(financeDomainModule.core).toBe(true);
  });

  it("id is 'finance'", async () => {
    const { financeDomainModule } = await import("../finance");
    expect(financeDomainModule.id).toBe("finance");
  });

  it("has at least one tool", async () => {
    const { financeDomainModule } = await import("../finance");
    expect(financeDomainModule.tools.length).toBeGreaterThan(0);
  });

  it("has an mcpExclude predicate", async () => {
    const { financeDomainModule } = await import("../finance");
    expect(typeof financeDomainModule.mcpExclude).toBe("function");
  });

  it("has at least one contextContributor (financeContributor)", async () => {
    const { financeDomainModule } = await import("../finance");
    expect(financeDomainModule.contextContributors.length).toBeGreaterThan(0);
  });

  it("promptSections is empty (no extra prompt sections for finance)", async () => {
    const { financeDomainModule } = await import("../finance");
    expect(financeDomainModule.promptSections).toEqual([]);
  });

  it("navEntries matches coreNavItems (same count)", async () => {
    const { financeDomainModule } = await import("../finance");
    const { coreNavItems } = await import("@/app/(dashboard)/dashboard-shell/nav-config");
    expect(financeDomainModule.navEntries.length).toBe(coreNavItems.length);
  });

  it("navEntries items have id, href, label, icon (as string)", async () => {
    const { financeDomainModule } = await import("../finance");
    for (const entry of financeDomainModule.navEntries) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.href).toBe("string");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.icon).toBe("string");
    }
  });
});

describe("financeDomainModule.tools — parity with getFinancialTools()", () => {
  it("tools deep-equals getFinancialTools()", async () => {
    const { financeDomainModule } = await import("../finance");
    const { getFinancialTools } = await import("@burnless/ai");
    expect(financeDomainModule.tools).toEqual(getFinancialTools());
  });
});

describe("domainRegistry with only finance — getActiveTools parity", () => {
  beforeEach(() => {
    vi.resetModules();
    // Re-apply mocks after resetModules
    vi.mock("@/lib/capabilities", () => ({
      isDomainEnabled: vi.fn(async () => true),
      requireDomainEnabled: vi.fn(async () => null),
      getCapabilities: vi.fn(() => ({})),
      requireCapability: vi.fn(() => null),
    }));
    vi.mock("@/lib/build-ai-context", () => ({
      buildAiContext: vi.fn(async () => ({
        snapshot: {},
        contextText: "mocked",
        nowContext: { iso: "2026-01-01T00:00", timezone: "UTC" },
      })),
    }));
    vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
    vi.mock("@burnless/db", () => ({
      db: {
        insert: vi.fn(() => ({ values: vi.fn(() => ({ catch: vi.fn() })) })),
        select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
      },
      aiToolAuditLogs: {},
      aiFeatureFlags: {},
      companies: {},
    }));
    vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gte: vi.fn(), sql: vi.fn() }));
    vi.mock("@/lib/ai-tools/scenarios", () => ({ scenarioSchemas: {}, scenarioHandlers: {} }));
    vi.mock("@/lib/ai-tools/headcount", () => ({ headcountSchemas: {}, headcountHandlers: {} }));
    vi.mock("@/lib/ai-tools/revenue", () => ({ revenueSchemas: {}, revenueHandlers: {} }));
    vi.mock("@/lib/ai-tools/funding", () => ({
      createFundingRound: vi.fn(), updateFundingRound: vi.fn(),
      deleteFundingRound: vi.fn(), addFundingRoundInvestor: vi.fn(),
      markGrantMilestoneHit: vi.fn(), modelDilution: vi.fn(),
    }));
    vi.mock("@/lib/ai-tools/forecasting", () => ({ forecastingSchemas: {}, forecastingHandlers: {} }));
    vi.mock("@/lib/ai-tools/analytics", () => ({ analyticsSchemas: {}, analyticsHandlers: {} }));
    vi.mock("@/lib/ai-tools/web-search", () => ({ webSearchSchemas: {}, webSearchHandlers: {} }));
    vi.mock("@/lib/ai-tools/web-scraping", () => ({ webScrapingSchemas: {}, webScrapingHandlers: {} }));
    vi.mock("@/lib/ai-tools/genui-display", () => ({ genuiDisplaySchemas: {}, genuiDisplayHandlers: {} }));
    vi.mock("@/lib/ai-tools/transactions", () => ({ transactionSchemas: {}, transactionHandlers: {} }));
    vi.mock("@/lib/ai-tools/mcp-describe", () => ({ describeMcpToolAction: vi.fn(() => null) }));
    vi.mock("@/lib/ai-tools/resolve-tool-scenario", () => ({ resolveToolScenario: vi.fn() }));
  });

  it("getActiveTools({companyId}) deep-equals getFinancialTools()", async () => {
    // Import fresh registry (populated by registerDomains() at module load)
    const { domainRegistry } = await import("../index");
    const { getFinancialTools } = await import("@burnless/ai");

    const activeTools = await domainRegistry.getActiveTools({ companyId: "test-company" });
    expect(activeTools).toEqual(getFinancialTools());
  });

  it("getActiveMcpExposedTools deep-equals getMcpExposedTools()", async () => {
    const { domainRegistry } = await import("../index");
    const { getMcpExposedTools } = await import("@burnless/ai");

    const activeMcp = await domainRegistry.getActiveMcpExposedTools({ companyId: "test-company" });
    expect(activeMcp).toEqual(getMcpExposedTools());
  });
});
