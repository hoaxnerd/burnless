/**
 * Cache invalidation regression tests — BUR-198
 *
 * Verifies every API mutation route calls revalidateTag() with the correct
 * cache tag, ensuring data changes are reflected immediately in the UI.
 *
 * Strategy: read source files and verify structural patterns. This catches
 * regressions where a developer adds a mutation without cache invalidation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const apiDir = join(import.meta.dirname, "../../app/api");

function readRoute(routePath: string): string {
  const fullPath = join(apiDir, routePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Route file not found: ${fullPath}`);
  }
  return readFileSync(fullPath, "utf-8");
}

describe("cache invalidation on mutations (BUR-198 regression)", () => {
  const routesWithTags: {
    path: string;
    tag: string;
    methods: ("POST" | "PUT" | "PATCH" | "DELETE")[];
  }[] = [
    { path: "accounts/route.ts", tag: "accounts", methods: ["POST"] },
    {
      path: "accounts/[id]/route.ts",
      tag: "accounts",
      methods: ["PUT", "DELETE"],
    },
    { path: "scenarios/route.ts", tag: "scenarios", methods: ["POST"] },
    {
      path: "scenarios/[id]/route.ts",
      tag: "scenarios",
      methods: ["PUT", "DELETE"],
    },
    {
      path: "forecast-lines/route.ts",
      tag: "forecast-lines",
      methods: ["POST"],
    },
    {
      path: "forecast-lines/[id]/route.ts",
      tag: "forecast-lines",
      methods: ["PUT", "DELETE"],
    },
    {
      path: "revenue-streams/route.ts",
      tag: "revenue-streams",
      methods: ["POST"],
    },
    {
      path: "revenue-streams/[id]/route.ts",
      tag: "revenue-streams",
      methods: ["PUT", "DELETE"],
    },
    {
      path: "headcount/route.ts",
      tag: "headcount-plans",
      methods: ["POST"],
    },
    {
      path: "headcount/[id]/route.ts",
      tag: "headcount-plans",
      methods: ["PUT", "DELETE"],
    },
    {
      path: "departments/route.ts",
      tag: "departments",
      methods: ["POST"],
    },
    {
      path: "departments/[id]/route.ts",
      tag: "departments",
      methods: ["PUT", "DELETE"],
    },
    {
      path: "funding-rounds/route.ts",
      tag: "funding-rounds",
      methods: ["POST"],
    },
    {
      path: "funding-rounds/[id]/route.ts",
      tag: "funding-rounds",
      methods: ["PUT", "DELETE"],
    },
  ];

  it.each(routesWithTags)(
    '$path should call revalidateTag("$tag")',
    ({ path, tag }) => {
      const source = readRoute(path);
      // Next 16 form is revalidateTag("tag", { expire: 0 }) — match the tag
      // without requiring the immediate close-paren.
      expect(source).toContain(`revalidateTag("${tag}"`);
    }
  );

  it.each(routesWithTags)(
    "$path should import revalidateTag from next/cache",
    ({ path }) => {
      const source = readRoute(path);
      expect(source).toMatch(
        /import\s*\{[^}]*revalidateTag[^}]*\}\s*from\s*["']next\/cache["']/
      );
    }
  );

  describe("tag parity between data.ts and API routes", () => {
    const tagPairs: { tag: string; dataFn: string; apiRoute: string }[] = [
      {
        tag: "scenarios",
        dataFn: "getScenarios",
        apiRoute: "scenarios/route.ts",
      },
      {
        tag: "accounts",
        dataFn: "getAccounts",
        apiRoute: "accounts/route.ts",
      },
      {
        tag: "forecast-lines",
        dataFn: "getForecastLines",
        apiRoute: "forecast-lines/route.ts",
      },
      {
        tag: "revenue-streams",
        dataFn: "getRevenueStreams",
        apiRoute: "revenue-streams/route.ts",
      },
      {
        tag: "headcount-plans",
        dataFn: "getHeadcountPlans",
        apiRoute: "headcount/route.ts",
      },
      {
        tag: "departments",
        dataFn: "getDepartments",
        apiRoute: "departments/route.ts",
      },
      {
        tag: "funding-rounds",
        dataFn: "getFundingRounds",
        apiRoute: "funding-rounds/route.ts",
      },
    ];

    it.each(tagPairs)(
      'tag "$tag" used in both data.ts ($dataFn) and $apiRoute',
      ({ tag, apiRoute }) => {
        const dataSource = readFileSync(
          join(import.meta.dirname, "../data.ts"),
          "utf-8"
        );
        const apiSource = readRoute(apiRoute);

        // Data layer declares the tag
        expect(dataSource).toContain(`"${tag}"`);
        // API route invalidates it (Next 16 2-arg form — match tag, not the paren)
        expect(apiSource).toContain(`revalidateTag("${tag}"`);
      }
    );
  });

  describe("known gaps — transactions route", () => {
    it("transactions/route.ts POST does NOT call revalidateTag (known gap)", () => {
      const source = readRoute("transactions/route.ts");
      // This is a known gap: transactions are not cached in data.ts
      // so no revalidateTag is needed. But if transactions get cached
      // in the future, this test should fail as a reminder.
      expect(source).not.toContain("revalidateTag");
    });

    it("getTransactions in data.ts is not cached, so no invalidation needed", () => {
      const dataSource = readFileSync(
        join(import.meta.dirname, "../data.ts"),
        "utf-8"
      );
      // Verify transactions are NOT cached (if this changes, add revalidateTag)
      expect(dataSource).not.toMatch(
        /getTransactions\s*=\s*(?:unstable_cache|cachedQuery)/
      );
    });
  });
});
