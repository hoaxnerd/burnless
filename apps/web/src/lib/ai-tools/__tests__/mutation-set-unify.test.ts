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

  // Mutation tools whose written data is NOT served through a tagged
  // unstable_cache, so there is intentionally no tag to invalidate. These must
  // mirror a base table the dashboard reads via request-scoped React.cache()
  // (re-read fresh on the next request) rather than a tagged server cache.
  //   - record_transaction (S3a Plan 3): writes the uncached `transactions`
  //     ledger — exactly like the api/transactions route, which also issues no
  //     revalidateTag (it relies on trackDataMutation + React.cache re-read).
  const UNCACHED_MUTATION_TOOLS = new Set<string>(["record_transaction"]);

  it("every mutation tool has a cache-tag mapping (no silent no-op invalidation)", () => {
    for (const name of MUTATION_TOOL_NAMES) {
      if (UNCACHED_MUTATION_TOOLS.has(name)) continue;
      const tags = __testables.MUTATION_CACHE_TAGS[name];
      expect(Array.isArray(tags) && tags.length > 0, `missing/empty cache tags for ${name}`).toBe(true);
    }
  });
});
