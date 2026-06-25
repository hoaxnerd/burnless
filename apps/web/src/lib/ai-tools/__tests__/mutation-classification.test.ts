/**
 * Registry-wide mutation classification (A3b-3).
 *
 * Proves mutation classification (write-gate category, plan-mode short-circuit,
 * cache-tags) is generalized from finance-static to registry-wide: ANY active
 * domain tool's `mutates`/`nonFacade` metadata is honored, exactly like finance
 * mutations. We mock @/lib/domains/registry's domainRegistry.getAll() to return a
 * finance-like module plus a company-knowledge-like module and assert the derived
 * predicates + category map behave correctly.
 *
 * packages/ai's MUTATION_TOOL_NAMES is the finance/CLI drift anchor and is NOT
 * involved in these registry-derived predicates.
 */

import { describe, it, expect, vi } from "vitest";
import type { ToolDefinition } from "@burnless/ai";

// ── Mocks (declared before the index import) ─────────────────────────────────
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@burnless/db", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn(() => ({ catch: vi.fn() })) })) },
  aiToolAuditLogs: {},
}));
vi.mock("../scenarios", () => ({ scenarioSchemas: {}, scenarioHandlers: {} }));
vi.mock("../headcount", () => ({ headcountSchemas: {}, headcountHandlers: {} }));
vi.mock("../revenue", () => ({ revenueSchemas: {}, revenueHandlers: {} }));
vi.mock("../funding", () => ({
  createFundingRound: vi.fn(),
  updateFundingRound: vi.fn(),
  deleteFundingRound: vi.fn(),
  addFundingRoundInvestor: vi.fn(),
  markGrantMilestoneHit: vi.fn(),
  modelDilution: vi.fn(),
}));
vi.mock("../forecasting", () => ({ forecastingSchemas: {}, forecastingHandlers: {} }));
vi.mock("../analytics", () => ({ analyticsSchemas: {}, analyticsHandlers: {} }));
vi.mock("../web-search", () => ({ webSearchSchemas: {}, webSearchHandlers: {} }));
vi.mock("../web-scraping", () => ({ webScrapingSchemas: {}, webScrapingHandlers: {} }));
vi.mock("../genui-display", () => ({ genuiDisplaySchemas: {}, genuiDisplayHandlers: {} }));
vi.mock("../transactions", () => ({ transactionSchemas: {}, transactionHandlers: {} }));
vi.mock("../company-knowledge", () => ({ companyKnowledgeSchemas: {}, companyKnowledgeHandlers: {} }));
vi.mock("@burnless/ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@burnless/ai")>();
  return {
    ...real,
    CreateFundingRoundSchema: { safeParse: vi.fn() },
    UpdateFundingRoundSchema: { safeParse: vi.fn() },
    DeleteFundingRoundSchema: { safeParse: vi.fn() },
    AddFundingRoundInvestorSchema: { safeParse: vi.fn() },
    MarkGrantMilestoneHitSchema: { safeParse: vi.fn() },
    ModelDilutionSchema: { safeParse: vi.fn() },
  };
});

// ── Fake registry: a finance-like module + a company-knowledge-like module ───
const financeLikeTools: ToolDefinition[] = [
  {
    name: "create_scenario",
    description: "Create a scenario",
    inputSchema: { type: "object", properties: {} },
    mutates: "write",
    nonFacade: true,
  },
  {
    name: "create_revenue_stream",
    description: "Create a revenue stream",
    inputSchema: { type: "object", properties: {} },
    mutates: "write",
    cacheTags: ["revenue-streams", "scenario-overrides"],
  },
  {
    name: "list_scenarios",
    description: "List scenarios",
    inputSchema: { type: "object", properties: {} },
  },
];

const ckLikeTools: ToolDefinition[] = [
  {
    name: "remember_fact",
    description: "Remember a fact",
    inputSchema: { type: "object", properties: {} },
    mutates: "write",
    nonFacade: true,
  },
  {
    name: "list_facts",
    description: "List facts",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "forget_fact",
    description: "Forget a fact",
    inputSchema: { type: "object", properties: {} },
    mutates: "delete",
    nonFacade: true,
  },
];

vi.mock("@/lib/domains/registry", () => ({
  domainRegistry: {
    getAll: vi.fn(() => [
      { id: "finance", tools: financeLikeTools },
      { id: "company-knowledge", tools: ckLikeTools },
    ]),
  },
}));

import { __testables, buildDomainToolCategories } from "../index";
import { categorizeToolName, resolvePermission } from "@burnless/ai";
import { BUILTIN_PERMISSION_DEFAULTS } from "@burnless/ai";

describe("registry-wide mutation classification", () => {
  it("classifies remember_fact / forget_fact as mutations; list_facts is not", () => {
    expect(__testables.isMutationTool("remember_fact")).toBe(true);
    expect(__testables.isMutationTool("forget_fact")).toBe(true);
    expect(__testables.isMutationTool("list_facts")).toBe(false);
  });

  it("remember_fact is non-facade → not diffable (plan mode skips it)", () => {
    expect(__testables.isDiffableMutationTool("remember_fact")).toBe(false);
    expect(__testables.isNonFacadeMutationTool("remember_fact")).toBe(true);
  });

  it("a finance write tool is still classified as a mutation (no regression)", () => {
    expect(__testables.isMutationTool("create_scenario")).toBe(true);
    // facade write → diffable
    expect(__testables.isDiffableMutationTool("create_revenue_stream")).toBe(true);
  });

  it("buildDomainToolCategories maps mutates → write/delete", () => {
    const cats = buildDomainToolCategories(ckLikeTools);
    expect(categorizeToolName("remember_fact", cats)).toBe("write");
    expect(categorizeToolName("forget_fact", cats)).toBe("delete");
    // a read tool is absent from the map → falls through to "read"
    expect(categorizeToolName("list_facts", cats)).toBe("read");
  });

  it("resolvePermission honors the write-mode clamp for a domain write tool", () => {
    const cats = buildDomainToolCategories(ckLikeTools);
    expect(
      resolvePermission("remember_fact", {
        defaults: BUILTIN_PERMISSION_DEFAULTS,
        sessionGrants: {},
        writeMode: "read_only",
        dynamicCategories: cats,
      }),
    ).toBe("deny");
    expect(
      resolvePermission("remember_fact", {
        defaults: BUILTIN_PERMISSION_DEFAULTS,
        sessionGrants: {},
        writeMode: "confirm",
        dynamicCategories: cats,
      }),
    ).toBe("ask");
  });
});
