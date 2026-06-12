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

/**
 * Routes that invalidate a cache but legitimately do NOT bump the financial
 * data-mutation timestamp. Each entry MUST justify WHY — the invariant only
 * applies to routes whose cache holds FINANCIAL compute data (the input to the
 * AI-insight badge + grace countdown). A route that invalidates a non-financial
 * cache (e.g. integration/connection config) would *spuriously* start the
 * insight-regeneration countdown for a change no metric depends on.
 */
const ALLOWED: { match: string; why: string }[] = [
  {
    match: "mcp/connections",
    why: "MCP connection CRUD invalidates only the non-financial `mcp-connections` cache (tool/integration config). It does not touch any financial entity, so trackDataMutation (which feeds the AI-insight freshness signal) must NOT fire — there is no MutationSource for integration config and bumping it would start a bogus insight-regeneration grace countdown.",
  },
  {
    match: "mcp/oauth/callback",
    why: "Completes an MCP OAuth handshake and re-probes the connection, invalidating only `mcp-connections` (non-financial). Same rationale as mcp/connections — no financial data changed.",
  },
];

function isAllowed(rel: string): boolean {
  const norm = rel.split(path.sep).join("/");
  return ALLOWED.some((a) => norm.includes(a.match));
}

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
      const rel = path.relative(API, file);
      if (isAllowed(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (!src.includes("revalidateTag")) continue; // only cache-invalidating routes
      if (!src.includes("trackDataMutation")) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      "Routes that invalidate a cache MUST also trackDataMutation so insights/freshness fire. Add trackDataMutation to:"
    ).toEqual([]);
  });
});
