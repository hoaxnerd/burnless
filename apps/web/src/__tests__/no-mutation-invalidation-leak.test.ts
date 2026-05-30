import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Regression guard — cache-invalidation ⟹ mutation-tracking.
 *
 * Invariant: any API route that calls `revalidateTag` (i.e. it mutates cached
 * compute data) MUST also call `trackDataMutation` (so the AI-insight badge,
 * sliding grace countdown, and cross-tab freshness signal fire for that change).
 *
 * This is the defensible direction: it caught the real funding-route leaks
 * (cap-table edits invalidated caches but never bumped lastMutationTime, so the
 * insight countdown silently never started). It deliberately does NOT require the
 * inverse — a route may legitimately call `trackDataMutation` WITHOUT
 * `revalidateTag` when it mutates UNCACHED data (e.g. transactions/import-rollback:
 * `getTransactions` is uncached, so router.refresh() already shows fresh data).
 * The revalidateTag↔tag pairing for cached entities is covered separately by
 * `src/lib/__tests__/cache-invalidation.test.ts`.
 */
const API = path.resolve(__dirname, "../app/api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("mutation invalidation parity", () => {
  it("every route that calls revalidateTag also calls trackDataMutation", () => {
    const offenders: string[] = [];
    for (const file of routeFiles(API)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("revalidateTag")) continue; // only cache-invalidating routes
      if (!src.includes("trackDataMutation")) {
        offenders.push(path.relative(API, file));
      }
    }
    expect(
      offenders,
      "Routes that invalidate a cache MUST also trackDataMutation so insights/freshness fire. Add trackDataMutation to:"
    ).toEqual([]);
  });
});
