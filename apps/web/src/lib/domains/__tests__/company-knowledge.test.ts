/**
 * company-knowledge domain — reach / toggle proof + fake-domain regression (A3b-2).
 *
 * Proves the extensibility contract: registering the company-knowledge module
 * surfaces its tools, context contributor, prompt section, and MCP tools purely
 * by registration; toggling it off (isDomainEnabled → false) removes ALL of them
 * while finance is unaffected. A throwaway fake module proves the contract holds
 * generically (not finance/company-knowledge-specific).
 *
 * Mocking mirrors finance-module.test.ts: the DB/Next deps pulled in transitively
 * by domains/index.ts → finance.ts are stubbed, and @/lib/capabilities.isDomainEnabled
 * is mocked so we control the per-company toggle.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Per-domain enable control (hoisted before imports) ────────────────────────
// Default: every domain enabled. Individual tests override via mockImplementation.
const enabledDomains = new Set<string>(["finance", "company-knowledge"]);

vi.mock("@/lib/capabilities", () => ({
  isDomainEnabled: vi.fn(async (id: string) => enabledDomains.has(id)),
  requireDomainEnabled: vi.fn(async () => null),
  getCapabilities: vi.fn(() => ({})),
  requireCapability: vi.fn(() => null),
}));

// ── DB / Next stubs (finance.ts + company-knowledge.ts transitively import) ────
// listMemory is the one we exercise directly in the contributor tests.
const listMemoryMock = vi.fn(async () => [] as unknown[]);
const insertMemoryMock = vi.fn(async () => ({ id: "m1" }));
const deleteMemoryByIdMock = vi.fn(async () => null);

vi.mock("@burnless/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ catch: vi.fn() })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
  },
  aiToolAuditLogs: {},
  aiFeatureFlags: {},
  companies: {},
  listMemory: (...args: unknown[]) => listMemoryMock(...(args as [])),
  insertMemory: (...args: unknown[]) => insertMemoryMock(...(args as [])),
  deleteMemoryById: (...args: unknown[]) => deleteMemoryByIdMock(...(args as [])),
  hasRecallMemory: vi.fn(async () => false), // memory domain (A5-3) imports this transitively
}));

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: vi.fn(async () => ({
    snapshot: {},
    contextText: "mocked context",
    nowContext: { iso: "2026-01-01T00:00", timezone: "UTC" },
  })),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gte: vi.fn(), sql: vi.fn() }));

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

const CK_DOMAIN = "company-knowledge";
const CK_TOOL_NAMES = ["remember_fact", "list_facts", "forget_fact"];

beforeEach(async () => {
  enabledDomains.clear();
  enabledDomains.add("finance");
  enabledDomains.add("company-knowledge");
  listMemoryMock.mockReset();
  listMemoryMock.mockResolvedValue([]);
  // Reset isDomainEnabled to the default set-driven impl (a prior block may have
  // overridden it via mockImplementation, which otherwise persists).
  const { isDomainEnabled } = await import("@/lib/capabilities");
  vi.mocked(isDomainEnabled).mockImplementation(async (id: string) => enabledDomains.has(id));
});

// ── REACH (domain ON) ─────────────────────────────────────────────────────────

describe("company-knowledge — registration (REACH)", () => {
  it("registerDomains() registers company-knowledge with its 3 tools", async () => {
    const { domainRegistry } = await import("../index");
    const mod = domainRegistry.getAll().find((m) => m.id === CK_DOMAIN);
    expect(mod).toBeDefined();
    expect(mod!.tools.map((t) => t.name).sort()).toEqual([...CK_TOOL_NAMES].sort());
  });

  it("getActiveTools / contributors / prompt sections / MCP tools all include company-knowledge when enabled", async () => {
    const { domainRegistry } = await import("../index");
    const { companyKnowledgeContributor } = await import("../company-knowledge");

    const tools = await domainRegistry.getActiveTools({ companyId: "c1" });
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(CK_TOOL_NAMES));

    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors).toContain(companyKnowledgeContributor);
    expect(contributors.map((c) => c.id)).toContain("company-knowledge-facts");

    const sections = await domainRegistry.getActivePromptSections({ companyId: "c1" });
    expect(sections.map((s) => s.id)).toContain("company-knowledge-prompt");

    const mcp = await domainRegistry.getActiveMcpExposedTools({ companyId: "c1" });
    // No mcpExclude → all 3 tools exposed over MCP.
    expect(mcp.map((t) => t.name)).toEqual(expect.arrayContaining(CK_TOOL_NAMES));
  });
});

describe("memory domain — registration (A5-3)", () => {
  it("registerDomains() registers the core memory module with the recall contributor and no tools", async () => {
    const { domainRegistry } = await import("../index");
    const { recallContributor } = await import("@/lib/memory/recall-contributor");
    const mod = domainRegistry.getAll().find((m) => m.id === "memory");
    expect(mod).toBeDefined();
    expect(mod!.core).toBe(true);
    expect(mod!.tools).toEqual([]);
    expect(mod!.contextContributors).toEqual([recallContributor]);
  });
});

describe("company-knowledge contributor.sections()", () => {
  it("renders one section bulleting both facts (label bold when present)", async () => {
    const { companyKnowledgeContributor } = await import("../company-knowledge");
    listMemoryMock.mockResolvedValueOnce([
      { id: "1", label: "Fundraising", content: "Raising a seed round." },
      { id: "2", label: null, content: "Top customer is Acme." },
    ] as unknown[]);

    const sections = await companyKnowledgeContributor.sections({ companyId: "c1" });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("What you should know about this company");
    expect(sections[0]!.order).toBe(10);
    expect(sections[0]!.body).toContain("**Fundraising:** Raising a seed round.");
    expect(sections[0]!.body).toContain("- Top customer is Acme.");
    // No-label fact must NOT have a bold prefix.
    expect(sections[0]!.body).not.toContain("**:** Top customer");
  });

  it("returns [] when there are no facts", async () => {
    const { companyKnowledgeContributor } = await import("../company-knowledge");
    listMemoryMock.mockResolvedValueOnce([] as unknown[]);
    expect(await companyKnowledgeContributor.sections({ companyId: "c1" })).toEqual([]);
  });

  it("returns [] when the memory read throws (graceful degradation)", async () => {
    const { companyKnowledgeContributor } = await import("../company-knowledge");
    listMemoryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await companyKnowledgeContributor.sections({ companyId: "c1" })).toEqual([]);
  });
});

// ── TOGGLE OFF ────────────────────────────────────────────────────────────────

describe("company-knowledge — toggle OFF removes all surfaces (finance unaffected)", () => {
  beforeEach(async () => {
    const { isDomainEnabled } = await import("@/lib/capabilities");
    // finance stays enabled; company-knowledge disabled for this company.
    vi.mocked(isDomainEnabled).mockImplementation(async (id) => id === "finance");
  });

  it("getActiveTools / contributors / prompt sections / MCP exclude every company-knowledge surface", async () => {
    const { domainRegistry } = await import("../index");

    const tools = await domainRegistry.getActiveTools({ companyId: "c1" });
    for (const name of CK_TOOL_NAMES) expect(tools.map((t) => t.name)).not.toContain(name);

    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).not.toContain("company-knowledge-facts");

    const sections = await domainRegistry.getActivePromptSections({ companyId: "c1" });
    expect(sections.map((s) => s.id)).not.toContain("company-knowledge-prompt");

    const mcp = await domainRegistry.getActiveMcpExposedTools({ companyId: "c1" });
    for (const name of CK_TOOL_NAMES) expect(mcp.map((t) => t.name)).not.toContain(name);

    // Finance survives the company-knowledge toggle-off.
    expect(contributors.map((c) => c.id)).toContain("finance-snapshot");
  });
});

// ── FINANCE UNAFFECTED ────────────────────────────────────────────────────────

describe("finance unaffected by company-knowledge toggle", () => {
  it("finance tools count + contributor present whether company-knowledge is on or off", async () => {
    const { domainRegistry } = await import("../index");
    const { getFinancialTools, DEFAULT_CONTEXT_HEADING } = await import("@burnless/ai");
    const { isDomainEnabled } = await import("@/lib/capabilities");

    const financeToolNames = new Set(getFinancialTools().map((t) => t.name));

    // ON: finance tools all present.
    let tools = await domainRegistry.getActiveTools({ companyId: "c1" });
    let financeCount = tools.filter((t) => financeToolNames.has(t.name)).length;
    expect(financeCount).toBe(financeToolNames.size);

    // Finance contributor uses DEFAULT_CONTEXT_HEADING — present here as the finance id.
    expect(DEFAULT_CONTEXT_HEADING).toBe("Current Financial Data");
    let contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).toContain("finance-snapshot");

    // OFF (company-knowledge disabled): finance count unchanged.
    vi.mocked(isDomainEnabled).mockImplementation(async (id) => id === "finance");
    tools = await domainRegistry.getActiveTools({ companyId: "c1" });
    financeCount = tools.filter((t) => financeToolNames.has(t.name)).length;
    expect(financeCount).toBe(financeToolNames.size);
    contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).toContain("finance-snapshot");
  });
});

// ── FAKE-DOMAIN REGRESSION GUARD (fresh registry — no singleton mutation) ──────

describe("fake-domain regression — contract holds generically", () => {
  it("a throwaway module's surfaces appear when enabled and vanish when disabled; dup id / dup tool throw", async () => {
    const { DomainRegistry } = await import("../registry");
    const { isDomainEnabled } = await import("@/lib/capabilities");
    type DomainModule = import("../contracts").DomainModule;
    type ToolDefinition = import("@burnless/ai").ToolDefinition;
    type ContextContributor = import("@burnless/ai").ContextContributor;
    type PromptSection = import("@burnless/ai").PromptSection;

    const fakeTool: ToolDefinition = {
      name: "test-fake-tool",
      description: "fake",
      inputSchema: { type: "object", properties: {}, required: [] },
    };
    const fakeContributor: ContextContributor = {
      id: "test-fake-contributor",
      domain: "test-fake",
      sections: vi.fn(async () => []),
    };
    const fakePrompt: PromptSection = { id: "test-fake-prompt", domain: "test-fake", body: "hi" };
    const fakeModule: DomainModule = {
      id: "test-fake",
      core: false,
      tools: [fakeTool],
      handlers: {},
      contextContributors: [fakeContributor],
      promptSections: [fakePrompt],
      navEntries: [],
    };

    const reg = new DomainRegistry();
    reg.register(fakeModule);

    // Enabled → surfaces appear.
    vi.mocked(isDomainEnabled).mockImplementation(async (id) => id === "test-fake");
    expect((await reg.getActiveTools({ companyId: "c1" })).map((t) => t.name)).toContain("test-fake-tool");
    expect((await reg.getActiveContextContributors({ companyId: "c1" })).map((c) => c.id)).toContain("test-fake-contributor");
    expect((await reg.getActivePromptSections({ companyId: "c1" })).map((s) => s.id)).toContain("test-fake-prompt");
    expect((await reg.getActiveMcpExposedTools({ companyId: "c1" })).map((t) => t.name)).toContain("test-fake-tool");

    // Disabled → all surfaces vanish.
    vi.mocked(isDomainEnabled).mockImplementation(async () => false);
    expect(await reg.getActiveTools({ companyId: "c1" })).toEqual([]);
    expect(await reg.getActiveContextContributors({ companyId: "c1" })).toEqual([]);
    expect(await reg.getActivePromptSections({ companyId: "c1" })).toEqual([]);
    expect(await reg.getActiveMcpExposedTools({ companyId: "c1" })).toEqual([]);

    // Duplicate id and duplicate tool name both throw at register().
    expect(() => reg.register({ ...fakeModule, tools: [] })).toThrow(/duplicate module id "test-fake"/);
    expect(() =>
      reg.register({ ...fakeModule, id: "test-fake-2", tools: [fakeTool] }),
    ).toThrow(/duplicate tool name "test-fake-tool"/);
  });
});
