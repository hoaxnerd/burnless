/**
 * Phase 4 A — Scenario Read-Path Resolver Wiring (Task 1: red tests)
 *
 * Regression: the four data.ts fetchers accept a scenarioId but never call
 * resolveEntities(). They return raw base-table rows, so edits made inside a
 * scenario never appear in the UI until the scenario is promoted.
 *
 * Tests 1–4 are expected to FAIL until T2–T5 fix the fetchers.
 * Test 5 is expected to PASS (base-only path already works correctly).
 * Do NOT fix the bug in this file.
 *
 * Uses real PGLite-backed DB (no mocks for DB semantics).
 */

import { describe, it, expect, vi } from "vitest";

// ── PGLite setup via packages/db setup file ─────────────────────────────────
// Importing this module triggers the apps/web vitest.setup.db.ts globalThis
// hijack (assigning __burnless_db to a PGLite instance), which the production
// @burnless/db module's singleton guard then captures.
import "@db-test/setup";

// ── Factory imports ──────────────────────────────────────────────────────────
// Use the REAL factory names from packages/db/src/__tests__/factories.ts.
import {
  createUser,
  createCompany,
  createDepartment,
  createScenario,
  createRevenueStream,
  createHeadcountPlan,
  createFundingRound,
  createScenarioOverride,
  createFinancialAccount,
} from "@db-test/factories";

// ── Mock: next/cache ─────────────────────────────────────────────────────────
// cachedQuery wraps unstable_cache. Make it a passthrough so queries run
// directly against the PGLite instance without Next.js cache involvement.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

// ── Mock: react (cache) ──────────────────────────────────────────────────────
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

// ── Mock: auth + next/headers ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

// ── Import data.ts functions under test ──────────────────────────────────────
// These must be imported AFTER vi.mock registrations above.
import {
  getRevenueStreams,
  getForecastLines,
  getHeadcountPlans,
  getFundingRounds,
} from "../data";

// No resetFactoryCounter call needed: IDs are monotonically incrementing per-suite,
// so each createX() call produces a unique PK even without a reset between tests.

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Phase 4 A — scenario read-path regression", () => {
  // ── Test 1 ────────────────────────────────────────────────────────────────
  // EXPECTED: FAIL until getRevenueStreams calls resolveEntities.
  // The current implementation returns raw base rows, ignoring the modify override.
  it("getRevenueStreams returns the override name when scenarioId has a modify override", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const scenario = await createScenario(company.id, {
      source: "blank",
      status: "active",
    });
    const stream = await createRevenueStream(company.id, { name: "Original Stream" });

    // Modify override: rename the stream inside the scenario
    await createScenarioOverride(scenario.id, "revenue_stream", stream.id, "modify", {
      ...stream,
      name: "Scenario-Renamed Stream",
    });

    const results = await getRevenueStreams(scenario.id);
    const names = results.map((r: { name: string }) => r.name);
    expect(names).toContain("Scenario-Renamed Stream");
    expect(names).not.toContain("Original Stream");
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────
  // EXPECTED: FAIL until getForecastLines calls resolveEntities.
  // The current implementation never returns scenario-created lines.
  it("getForecastLines returns scenario-created lines", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const scenario = await createScenario(company.id, {
      source: "blank",
      status: "active",
    });
    const account = await createFinancialAccount(company.id);

    // Scenario-created forecast line (no base row — action: "create")
    const fakeLineId = "00000000-0000-4000-a000-0000feedbeef";
    await createScenarioOverride(scenario.id, "forecast_line", fakeLineId, "create", {
      id: fakeLineId,
      companyId: company.id,
      accountId: account.id,
      name: "Scenario-Created Line",
      startDate: new Date("2026-01-01").toISOString(),
    });

    const results = await getForecastLines(scenario.id);
    const ids = results.map((r: { id: string }) => r.id);
    expect(ids).toContain(fakeLineId);
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────
  // EXPECTED: FAIL until getHeadcountPlans calls resolveEntities.
  // The current implementation returns the deleted row since it ignores overrides.
  it("getHeadcountPlans excludes scenario-deleted rows", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const scenario = await createScenario(company.id, {
      source: "blank",
      status: "active",
    });
    const dept = await createDepartment(company.id);
    const hire = await createHeadcountPlan(company.id, dept.id, { title: "Engineer" });

    // Delete override: remove the hire inside the scenario
    await createScenarioOverride(scenario.id, "headcount_plan", hire.id, "delete");

    const results = await getHeadcountPlans(scenario.id);
    const ids = results.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(hire.id);
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────
  // EXPECTED: FAIL until getFundingRounds accepts and applies scenarioId.
  // Current signature is (companyId: string) — 2nd arg silently dropped.
  // The assertion on "Scenario-Renamed Round" will fail because base name is returned.
  it("getFundingRounds with scenarioId merges modify overrides", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const scenario = await createScenario(company.id, {
      source: "blank",
      status: "active",
    });
    const round = await createFundingRound(company.id, { name: "Original Round" });

    // Modify override: rename the round inside the scenario
    await createScenarioOverride(scenario.id, "funding_round", round.id, "modify", {
      ...round,
      name: "Scenario-Renamed Round",
    });

    // Pass scenarioId as 2nd arg — current 1-arg signature silently drops it
    const results = await (getFundingRounds as (cId: string, sId: string) => Promise<unknown[]>)(
      company.id,
      scenario.id,
    );
    const names = (results as Array<{ name: string }>).map((r) => r.name);
    expect(names).toContain("Scenario-Renamed Round");
    expect(names).not.toContain("Original Round");
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────
  // EXPECTED: PASS — calling getFundingRounds with null scenarioId (base-only)
  // returns the original base row. This exercises the current behavior and should
  // continue passing after the fix.
  it("getFundingRounds with null scenarioId returns base only", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const scenario = await createScenario(company.id, {
      source: "blank",
      status: "active",
    });
    const round = await createFundingRound(company.id, { name: "Base Round" });

    // Insert a modify override — but we query with null scenarioId (base path)
    await createScenarioOverride(scenario.id, "funding_round", round.id, "modify", {
      ...round,
      name: "Should Not Appear",
    });

    const results = await getFundingRounds(company.id, null);
    const names = (results as Array<{ name: string }>).map((r) => r.name);
    expect(names).toContain("Base Round");
  });
});
