/**
 * skills domain — registration + capability gating proof (A6-2).
 *
 * Mirrors company-knowledge.test.ts.
 * Asserts:
 *   (a) domainRegistry.getAll() includes id:"skills" with capability:"skills",
 *       the load_skill tool, the contributor, and the prompt section.
 *   (b) With getCapabilities().skills === true → ALL skills surfaces appear in
 *       getActiveTools / getActiveContextContributors / getActivePromptSections.
 *   (c) With skills === false (cloud) → ALL skills surfaces vanish, while
 *       finance / company-knowledge / memory remain.
 *
 * Mocking pattern mirrors company-knowledge.test.ts — stub all transitive
 * DB/Next deps that domains/index.ts and ai-tools/index.ts import.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Capability control (hoisted) ──────────────────────────────────────────────
// Default: every domain enabled + skills cap ON.
const enabledDomains = new Set<string>(["finance", "company-knowledge", "memory", "skills"]);
let skillsCapEnabled = true;

vi.mock("@/lib/capabilities", () => ({
  getCapabilities: vi.fn(() => ({ skills: skillsCapEnabled })),
  requireCapability: vi.fn(() => null),
}));

vi.mock("@/lib/domain-gating", () => ({
  isDomainEnabled: vi.fn(async (id: string) => enabledDomains.has(id)),
  requireDomainEnabled: vi.fn(async () => null),
}));

// ── DB / Next stubs ───────────────────────────────────────────────────────────
vi.mock("@burnless/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ catch: vi.fn() })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
  },
  aiToolAuditLogs: {},
  aiFeatureFlags: {},
  companies: {},
  listMemory: vi.fn(async () => []),
  insertMemory: vi.fn(async () => ({ id: "m1" })),
  deleteMemoryById: vi.fn(async () => null),
  hasRecallMemory: vi.fn(async () => false),
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

// ── ai-tools sub-module stubs (mirrors company-knowledge.test.ts) ─────────────
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
// A6-2: stub the skills tool handler (no FS access in unit tests)
vi.mock("@/lib/ai-tools/skills", () => ({
  skillsSchemas: { load_skill: {} },
  skillsHandlers: { load_skill: vi.fn() },
}));
// A6-2: stub the SkillSource (no FS in unit tests)
vi.mock("@/lib/skills/source", () => ({
  getSkillSource: vi.fn(() => ({ list: vi.fn(async () => []), load: vi.fn(async () => null) })),
  skillsDir: vi.fn(() => "/fake/skills"),
  FileSystemSkillSource: vi.fn(),
}));

const SKILLS_DOMAIN = "skills";
const SKILLS_TOOL_NAME = "load_skill";

beforeEach(async () => {
  enabledDomains.clear();
  enabledDomains.add("finance");
  enabledDomains.add("company-knowledge");
  enabledDomains.add("memory");
  enabledDomains.add("skills");
  skillsCapEnabled = true;

  const { getCapabilities } = await import("@/lib/capabilities");
  const { isDomainEnabled } = await import("@/lib/domain-gating");
  vi.mocked(isDomainEnabled).mockImplementation(async (id: string) => {
    // If skills capability is off, isDomainEnabled should return false for skills
    // (mirroring what the real isDomainEnabled does via the capability gate).
    if (id === "skills" && !skillsCapEnabled) return false;
    return enabledDomains.has(id);
  });
  vi.mocked(getCapabilities).mockImplementation(() => ({ skills: skillsCapEnabled } as ReturnType<typeof getCapabilities>));
});

// ── (a) Registration ──────────────────────────────────────────────────────────

describe("skills — registration", () => {
  it("registerDomains() registers skills with capability:'skills' and the load_skill tool", async () => {
    const { domainRegistry } = await import("../index");
    const mod = domainRegistry.getAll().find((m) => m.id === SKILLS_DOMAIN);
    expect(mod).toBeDefined();
    expect(mod!.capability).toBe("skills");
    expect(mod!.core).toBe(false);
    expect(mod!.tools.map((t) => t.name)).toContain(SKILLS_TOOL_NAME);
  });

  it("registered module includes the skills contributor (id:'skills-list') and prompt section (id:'skills-prompt')", async () => {
    const { domainRegistry } = await import("../index");
    const mod = domainRegistry.getAll().find((m) => m.id === SKILLS_DOMAIN);
    expect(mod).toBeDefined();
    expect(mod!.contextContributors.map((c) => c.id)).toContain("skills-list");
    expect(mod!.promptSections.map((s) => s.id)).toContain("skills-prompt");
  });
});

// ── (b) REACH (skills cap ON) ─────────────────────────────────────────────────

describe("skills — capability ON → surfaces appear", () => {
  it("getActiveTools includes load_skill when skills is enabled", async () => {
    const { domainRegistry } = await import("../index");
    const tools = await domainRegistry.getActiveTools({ companyId: "c1" });
    expect(tools.map((t) => t.name)).toContain(SKILLS_TOOL_NAME);
  });

  it("getActiveContextContributors includes skills-list contributor", async () => {
    const { domainRegistry } = await import("../index");
    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).toContain("skills-list");
  });

  it("getActivePromptSections includes skills-prompt", async () => {
    const { domainRegistry } = await import("../index");
    const sections = await domainRegistry.getActivePromptSections({ companyId: "c1" });
    expect(sections.map((s) => s.id)).toContain("skills-prompt");
  });
});

// ── (c) GATING (skills cap OFF / cloud) ──────────────────────────────────────

describe("skills — capability OFF → all skills surfaces absent, finance/company-knowledge/memory remain", () => {
  beforeEach(async () => {
    skillsCapEnabled = false;
    const { getCapabilities } = await import("@/lib/capabilities");
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    vi.mocked(isDomainEnabled).mockImplementation(async (id: string) => {
      if (id === "skills") return false; // cap gate blocks it
      return enabledDomains.has(id);
    });
    vi.mocked(getCapabilities).mockImplementation(() => ({ skills: false } as ReturnType<typeof getCapabilities>));
  });

  it("getActiveTools excludes load_skill", async () => {
    const { domainRegistry } = await import("../index");
    const tools = await domainRegistry.getActiveTools({ companyId: "c1" });
    expect(tools.map((t) => t.name)).not.toContain(SKILLS_TOOL_NAME);
  });

  it("getActiveContextContributors excludes skills-list", async () => {
    const { domainRegistry } = await import("../index");
    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).not.toContain("skills-list");
  });

  it("getActivePromptSections excludes skills-prompt", async () => {
    const { domainRegistry } = await import("../index");
    const sections = await domainRegistry.getActivePromptSections({ companyId: "c1" });
    expect(sections.map((s) => s.id)).not.toContain("skills-prompt");
  });

  it("finance contributor (finance-snapshot) remains when skills cap is off", async () => {
    const { domainRegistry } = await import("../index");
    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).toContain("finance-snapshot");
  });

  it("company-knowledge contributor remains when skills cap is off", async () => {
    const { domainRegistry } = await import("../index");
    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors.map((c) => c.id)).toContain("company-knowledge-facts");
  });
});
