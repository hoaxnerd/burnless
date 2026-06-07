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
  // Pull the real MUTATION_TOOL_NAMES from the actual package but stub out schemas
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

import { MUTATION_TOOL_NAMES } from "@burnless/ai";
import { __testables } from "../index";

describe("mutation-set unification", () => {
  it("the cache-layer mutation set equals the permission-layer mutation set", () => {
    const cacheSet = __testables.MUTATION_TOOLS;
    expect([...cacheSet].sort()).toEqual([...MUTATION_TOOL_NAMES].sort());
  });

  it("every mutation tool has a cache-tag mapping (no silent no-op invalidation)", () => {
    for (const name of MUTATION_TOOL_NAMES) {
      expect(__testables.MUTATION_CACHE_TAGS[name], `missing cache tags for ${name}`).toBeTruthy();
    }
  });
});
