/**
 * integrations domain — context-only contributor (C3.3).
 *
 * The integrations module's ONLY surface is a ContextContributor that injects a
 * "Connected data sources" section listing each ACTIVE integration plus a
 * relative last-sync time and the number of integration-sourced transactions.
 *
 * Proves: (1) one active stripe integration → one section whose body names
 * "Stripe"; (2) no active integrations → []; (3) a DB error → [] (never throws,
 * graceful degradation); plus registration (registered, core, no tools).
 *
 * Mocking mirrors company-knowledge.test.ts: stub @burnless/db and the Next/DB
 * deps pulled in transitively by domains/index.ts → finance.ts, and control the
 * per-domain enable toggle via @/lib/domain-gating.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── @burnless/db: control the two reads the contributor performs ──────────────
// activeIntegrationsMock → the active-integrations select; txCountMock → the
// integration-source transaction count select. Both reached through db.select().
const activeIntegrationsMock = vi.fn(async () => [] as unknown[]);
const txCountMock = vi.fn(async () => [{ value: 0 }] as Array<{ value: number }>);

// db.select() is called twice per sections() invocation. We route by call order:
// first → active integrations, second → tx count. Each returns a thenable chain.
let selectCall = 0;
function makeChain(resolver: () => Promise<unknown>) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  chain.from = passthrough;
  chain.where = passthrough;
  chain.limit = passthrough;
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resolver().then(onFulfilled, onRejected);
  return chain;
}

vi.mock("@burnless/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ catch: vi.fn() })) })),
    select: vi.fn(() => {
      const isFirst = selectCall === 0;
      selectCall += 1;
      return makeChain(isFirst ? activeIntegrationsMock : txCountMock);
    }),
  },
  integrations: {},
  transactions: {},
  // finance.ts + company-knowledge.ts + memory transitively reference these.
  aiToolAuditLogs: {},
  aiFeatureFlags: {},
  companies: {},
  listMemory: vi.fn(async () => []),
  insertMemory: vi.fn(async () => ({ id: "m1" })),
  deleteMemoryById: vi.fn(async () => null),
  hasRecallMemory: vi.fn(async () => false),
}));

// ── Per-domain enable control + the rest of the transitive web/DB stubs ───────
const enabledDomains = new Set<string>(["finance", "integrations"]);

vi.mock("@/lib/capabilities", () => ({
  getCapabilities: vi.fn(() => ({})),
  requireCapability: vi.fn(() => null),
}));

vi.mock("@/lib/domain-gating", () => ({
  isDomainEnabled: vi.fn(async (id: string) => enabledDomains.has(id)),
  requireDomainEnabled: vi.fn(async () => null),
}));

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: vi.fn(async () => ({
    snapshot: {},
    contextText: "mocked context",
    nowContext: { iso: "2026-01-01T00:00", timezone: "UTC" },
  })),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
}));

// ai-tools sub-modules that ai-tools/index.ts imports (finance.handlers references it)
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
vi.mock("@/lib/ai-tools/skills", () => ({
  skillsSchemas: { load_skill: {} },
  skillsHandlers: { load_skill: vi.fn() },
}));
vi.mock("@/lib/skills/source", () => ({
  getSkillSource: vi.fn(() => ({ list: vi.fn(async () => []), load: vi.fn(async () => null) })),
  skillsDir: vi.fn(() => "/fake/skills"),
  FileSystemSkillSource: vi.fn(),
}));

const INTEGRATIONS_DOMAIN = "integrations";

beforeEach(() => {
  selectCall = 0;
  enabledDomains.clear();
  enabledDomains.add("finance");
  enabledDomains.add("integrations");
  activeIntegrationsMock.mockReset();
  activeIntegrationsMock.mockResolvedValue([]);
  txCountMock.mockReset();
  txCountMock.mockResolvedValue([{ value: 0 }]);
});

// ── contributor.sections() ────────────────────────────────────────────────────

describe("integrations contributor.sections()", () => {
  it("renders one 'Connected data sources' section naming Stripe with sync + tx count at section footer", async () => {
    const { integrationsContributor } = await import("../integrations");
    activeIntegrationsMock.mockResolvedValueOnce([
      {
        type: "stripe",
        status: "active",
        lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
    ]);
    txCountMock.mockResolvedValueOnce([{ value: 1240 }]);

    const sections = await integrationsContributor.sections({ companyId: "c1" });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("Connected data sources");
    expect(sections[0]!.body).toContain("Stripe");
    // Relative-time in the bullet.
    expect(sections[0]!.body.toLowerCase()).toContain("ago");
    // Total tx count appears exactly once at the section footer.
    expect(sections[0]!.body).toContain("Total integration-sourced transactions: 1,240");
    expect(sections[0]!.body.match(/1,240/g)).toHaveLength(1);
  });

  it("returns [] when there are no active integrations", async () => {
    const { integrationsContributor } = await import("../integrations");
    activeIntegrationsMock.mockResolvedValueOnce([]);
    expect(await integrationsContributor.sections({ companyId: "c1" })).toEqual([]);
  });

  it("returns [] when the integrations read throws (graceful degradation)", async () => {
    const { integrationsContributor } = await import("../integrations");
    activeIntegrationsMock.mockRejectedValueOnce(new Error("db down"));
    await expect(
      integrationsContributor.sections({ companyId: "c1" }),
    ).resolves.toEqual([]);
  });
});

// ── Registration ──────────────────────────────────────────────────────────────

describe("integrations domain — registration", () => {
  it("registerDomains() registers a core, context-only integrations module (no tools)", async () => {
    const { domainRegistry } = await import("../index");
    const { integrationsContributor } = await import("../integrations");

    const mod = domainRegistry.getAll().find((m) => m.id === INTEGRATIONS_DOMAIN);
    expect(mod).toBeDefined();
    expect(mod!.core).toBe(true);
    expect(mod!.tools).toEqual([]);
    expect(mod!.promptSections).toEqual([]);
    expect(mod!.navEntries).toEqual([]);
    expect(mod!.contextContributors).toEqual([integrationsContributor]);
  });

  it("getActiveContextContributors includes the integrations contributor when enabled", async () => {
    const { domainRegistry } = await import("../index");
    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).toContain("integrations-sources");
  });
});
