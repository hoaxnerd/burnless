/**
 * A2b web-side registry derivation snapshot gate.
 *
 * Freezes the EXACT membership of MUTATION_CACHE_TAGS and
 * NON_FACADE_MUTATION_TOOLS as they existed before the A2b refactor.
 * The EXPECTED_* literals were copied verbatim from the pre-A2b
 * hand-maintained objects in apps/web/src/lib/ai-tools/index.ts.
 *
 * After the refactor the same tests must stay green — proving ZERO behavior
 * change. The derivations in index.ts now read ToolDefinition.cacheTags and
 * .nonFacade; these snapshots are the authority.
 *
 * CRITICAL: Do NOT edit EXPECTED_* values. If a derivation disagrees, fix the
 * derivation or its annotations, not the expected snapshot.
 */

import { describe, it, expect, vi } from "vitest";

// Mock all modules that index.ts pulls in so we can import it without a running
// Next.js / DB environment. These mocks must be declared before the import below.
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
vi.mock("@burnless/ai", async (importOriginal) => {
  // Pull the real exports from the actual package but stub out schemas
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

import { __testables } from "../index";

// ── Frozen snapshots (pre-A2b source of truth) ───────────────────────────────

/** Copied verbatim from the hand-maintained MUTATION_CACHE_TAGS before A2b. */
const EXPECTED_MUTATION_CACHE_TAGS: Readonly<Record<string, string[]>> = {
  create_scenario: ["scenarios"],
  update_scenario: ["scenarios"],
  delete_scenario: ["scenarios"],
  create_headcount: ["headcount-plans", "scenario-overrides"],
  update_headcount: ["headcount-plans", "scenario-overrides"],
  delete_headcount: ["headcount-plans", "scenario-overrides"],
  create_salary_change: ["headcount-plans", "scenario-overrides"],
  create_bonus: ["headcount-plans", "scenario-overrides"],
  create_equity_grant: ["headcount-plans", "scenario-overrides"],
  create_department: ["departments", "scenario-overrides"],
  update_department: ["departments", "scenario-overrides"],
  delete_department: ["departments", "headcount-plans", "scenario-overrides"],
  create_revenue_stream: ["revenue-streams", "scenario-overrides"],
  update_revenue_stream: ["revenue-streams", "scenario-overrides"],
  delete_revenue_stream: ["revenue-streams", "scenario-overrides"],
  create_funding_round: ["funding-rounds", "scenario-overrides", "cap-table"],
  update_funding_round: ["funding-rounds", "scenario-overrides", "cap-table"],
  delete_funding_round: ["funding-rounds", "scenario-overrides", "cap-table"],
  create_funding_round_investor: ["funding-rounds", "cap-table"],
  update_grant_milestone: ["funding-rounds", "scenario-overrides", "cap-table"],
  create_forecast_line: ["forecast-lines", "scenario-overrides"],
  update_forecast_line: ["forecast-lines", "scenario-overrides"],
  delete_forecast_line: ["forecast-lines", "scenario-overrides"],
  create_account: ["accounts", "scenario-overrides"],
  update_account: ["accounts", "scenario-overrides"],
  delete_account: ["accounts", "scenario-overrides"],
};

/** Copied verbatim from the hand-maintained NON_FACADE_MUTATION_TOOLS before A2b. */
const EXPECTED_NON_FACADE = new Set<string>([
  "create_scenario",
  "update_scenario",
  "delete_scenario",
  "create_funding_round_investor",
  "record_transaction",
]);

// ── Assertions ────────────────────────────────────────────────────────────────

describe("A2b web: derived MUTATION_CACHE_TAGS + NON_FACADE_MUTATION_TOOLS", () => {
  it("MUTATION_CACHE_TAGS deep-equals the frozen snapshot", () => {
    expect(__testables.MUTATION_CACHE_TAGS).toEqual(EXPECTED_MUTATION_CACHE_TAGS);
  });

  it("NON_FACADE_MUTATION_TOOLS membership matches frozen snapshot", () => {
    expect([...__testables.NON_FACADE_MUTATION_TOOLS].sort()).toEqual(
      [...EXPECTED_NON_FACADE].sort(),
    );
  });

  it("record_transaction is not in MUTATION_CACHE_TAGS (intentionally uncached)", () => {
    expect(__testables.MUTATION_CACHE_TAGS).not.toHaveProperty("record_transaction");
  });

  it("every key in MUTATION_CACHE_TAGS has a non-empty tags array", () => {
    for (const [name, tags] of Object.entries(__testables.MUTATION_CACHE_TAGS)) {
      expect(Array.isArray(tags) && tags.length > 0, `empty tags for ${name}`).toBe(true);
    }
  });
});
