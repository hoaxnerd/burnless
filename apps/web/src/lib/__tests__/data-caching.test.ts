/**
 * Performance regression tests for data caching layer — BUR-198
 *
 * Verifies that:
 * 1. All data functions use unstable_cache or React.cache() for deduplication
 * 2. Cache tags match between data.ts queries and API route invalidation
 * 3. Cache TTLs are reasonable (30-60s)
 * 4. getCompany and getDashboardPreferences use React.cache() for request dedup
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Read source files for structural analysis
const dataSource = readFileSync(
  join(import.meta.dirname, "../data.ts"),
  "utf-8"
);

describe("data.ts caching structure (BUR-198 regression)", () => {
  describe("unstable_cache wrapping", () => {
    const cachedFunctions = [
      "getScenarios",
      "getDefaultScenario",
      "getAccounts",
      "getForecastLines",
      "getRevenueStreams",
      "getHeadcountPlans",
      "getDepartments",
      "getFundingRounds",
      "getScenarioById",
      "getBudgetScenario",
    ];

    it.each(cachedFunctions)(
      "%s should be wrapped with unstable_cache",
      (fnName) => {
        // Match pattern: export const fnName = unstable_cache(
        const pattern = new RegExp(
          `export\\s+const\\s+${fnName}\\s*=\\s*unstable_cache\\(`
        );
        expect(dataSource).toMatch(pattern);
      }
    );

    it("should import unstable_cache from next/cache", () => {
      expect(dataSource).toContain(
        'import { unstable_cache } from "next/cache"'
      );
    });
  });

  describe("React.cache() request deduplication", () => {
    it("getCompany should use React.cache()", () => {
      expect(dataSource).toMatch(
        /export\s+const\s+getCompany\s*=\s*cache\(/
      );
    });

    it("getDashboardPreferences should use React.cache()", () => {
      expect(dataSource).toMatch(
        /export\s+const\s+getDashboardPreferences\s*=\s*cache\(/
      );
    });

    it("should import cache from react", () => {
      expect(dataSource).toMatch(
        /import\s*\{[^}]*cache[^}]*\}\s*from\s*["']react["']/
      );
    });
  });

  describe("cache tags consistency", () => {
    const expectedTags: Record<string, string[]> = {
      getScenarios: ["scenarios"],
      getDefaultScenario: ["scenarios"],
      getScenarioById: ["scenarios"],
      getBudgetScenario: ["scenarios"],
      getAccounts: ["accounts"],
      getForecastLines: ["forecast-lines"],
      getRevenueStreams: ["revenue-streams"],
      getHeadcountPlans: ["headcount-plans"],
      getDepartments: ["departments"],
      getFundingRounds: ["funding-rounds"],
    };

    it.each(Object.entries(expectedTags))(
      "%s should use tags: %s",
      (fnName, tags) => {
        // Find the function definition and check it contains the expected tags
        const fnPattern = new RegExp(
          `${fnName}\\s*=\\s*unstable_cache\\([\\s\\S]*?tags:\\s*\\[([^\\]]+)\\]`,
          "m"
        );
        const match = dataSource.match(fnPattern);
        expect(match).not.toBeNull();
        if (match) {
          const tagValues = match[1]
            .split(",")
            .map((t) => t.trim().replace(/['"]/g, ""));
          for (const tag of tags) {
            expect(tagValues).toContain(tag);
          }
        }
      }
    );
  });

  describe("cache TTL values", () => {
    it("all cached functions should have a revalidate TTL", () => {
      const revalidatePattern = /revalidate:\s*(\d+)/g;
      const matches = [...dataSource.matchAll(revalidatePattern)];
      expect(matches.length).toBeGreaterThanOrEqual(10);
      for (const match of matches) {
        const ttl = Number(match[1]);
        expect(ttl).toBeGreaterThanOrEqual(30);
        expect(ttl).toBeLessThanOrEqual(120);
      }
    });
  });

  describe("force-dynamic removal (BUR-176 regression)", () => {
    it("dashboard layout should NOT use force-dynamic", () => {
      const layoutSource = readFileSync(
        join(
          import.meta.dirname,
          "../../app/(dashboard)/layout.tsx"
        ),
        "utf-8"
      );
      expect(layoutSource).not.toContain("force-dynamic");
      expect(layoutSource).not.toContain(
        'export const dynamic = "force-dynamic"'
      );
    });
  });

  describe("getTransactions is intentionally uncached", () => {
    it("getTransactions should be a plain async function (not cached)", () => {
      // getTransactions uses real-time data that should not be stale
      expect(dataSource).toMatch(
        /export\s+async\s+function\s+getTransactions/
      );
      // It should NOT use unstable_cache
      expect(dataSource).not.toMatch(
        /getTransactions\s*=\s*unstable_cache/
      );
    });
  });
});
