/**
 * Phase 4 A — Scenario Read-Path Resolver Wiring (Task 1: red tests)
 *
 * Reproduces the regression: the four data.ts fetchers accept a scenarioId
 * but never call resolveEntities(). They return raw base-table rows, so edits
 * made inside a scenario never appear in the UI until the scenario is promoted.
 *
 * All five tests are expected to FAIL until T2-T5 fix the fetchers.
 * Do NOT fix the bug in this file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory fixture store ──────────────────────────────────────────────────
// Populated per-test via resetFixtures(). The mock DB reads from here.

type Row = Record<string, unknown>;

interface Fixtures {
  scenarios: Row[];
  revenueStreams: Row[];
  forecastLines: Row[];
  headcountPlans: Row[];
  fundingRounds: Row[];
  scenarioOverrides: Row[];
}

let fixtures: Fixtures = {
  scenarios: [],
  revenueStreams: [],
  forecastLines: [],
  headcountPlans: [],
  fundingRounds: [],
  scenarioOverrides: [],
};

function resetFixtures() {
  fixtures = {
    scenarios: [],
    revenueStreams: [],
    forecastLines: [],
    headcountPlans: [],
    fundingRounds: [],
    scenarioOverrides: [],
  };
}

// ── Drizzle table name lookup ─────────────────────────────────────────────────
// Drizzle tables expose their SQL table name via Symbol.for("drizzle:Name").
const DRIZZLE_NAME = Symbol.for("drizzle:Name");

function getFixtureByTable(table: unknown): Row[] {
  const name = (table as Record<symbol, unknown>)[DRIZZLE_NAME] as string | undefined;
  switch (name) {
    case "scenarios":       return fixtures.scenarios;
    case "revenue_streams": return fixtures.revenueStreams;
    case "forecast_lines":  return fixtures.forecastLines;
    case "headcount_plans": return fixtures.headcountPlans;
    case "funding_rounds":  return fixtures.fundingRounds;
    case "scenario_overrides": return fixtures.scenarioOverrides;
    default: return [];
  }
}

// ── Drizzle predicate evaluator ───────────────────────────────────────────────
// Handles eq(col, value) predicates used in all four fetchers.
// queryChunks layout (from drizzle-orm internals):
//   chunk.columnType → column object (SQL col name at chunk.name)
//   chunk with 'brand' key → Param object (comparison value at chunk.value)
function applyWhere(rows: Row[], wherePred: unknown): Row[] {
  if (!wherePred) return rows;
  const sql = wherePred as { queryChunks?: unknown[] };
  if (!Array.isArray(sql.queryChunks)) return rows;

  const colChunk = sql.queryChunks.find(
    (c): c is { name: string; columnType: string } =>
      c !== null && typeof c === "object" && "columnType" in (c as object),
  );
  const valChunk = sql.queryChunks.find(
    (c): c is { value: unknown } =>
      c !== null && typeof c === "object" && "brand" in (c as object),
  );

  if (!colChunk || !valChunk) return rows;

  const sqlColName = colChunk.name; // e.g. "company_id"
  // Drizzle maps "company_id" → "companyId" in JS results.
  // Fixtures may use either form, so we try both.
  const camelColName = sqlColName.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
  const matchValue = valChunk.value;

  return rows.filter(
    (row) => row[sqlColName] === matchValue || row[camelColName] === matchValue,
  );
}

// ── Minimal mock DB ───────────────────────────────────────────────────────────

function makeQueryBuilder(table: unknown) {
  const allRows = getFixtureByTable(table);
  let filtered: Row[] = [...allRows];

  const builder = {
    where(pred: unknown) {
      filtered = applyWhere(filtered, pred);
      return builder;
    },
    limit(n: number) {
      filtered = filtered.slice(0, n);
      return builder;
    },
    orderBy() {
      return builder;
    },
    then(resolve: (v: Row[]) => unknown, reject: (e: unknown) => unknown) {
      Promise.resolve(filtered).then(resolve, reject);
    },
  };
  return builder;
}

// ── vi.mock declarations (must be at module top-level, hoisted by Vitest) ────

vi.mock("@burnless/db", async (importActual) => {
  const actual = await importActual<typeof import("@burnless/db")>();
  return {
    ...actual,
    db: {
      select(_fields?: Record<string, unknown>) {
        return {
          from(table: unknown) {
            return makeQueryBuilder(table);
          },
        };
      },
    },
    getOverrideCount: vi.fn().mockResolvedValue(0),
    getCompanyForUser: vi.fn().mockResolvedValue(null),
    listResolvedSalaryChanges: vi.fn().mockResolvedValue([]),
    listResolvedBonuses: vi.fn().mockResolvedValue([]),
    listResolvedEquityGrants: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

vi.mock("../auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// ── Functions under test (imported AFTER mocks) ───────────────────────────────

import {
  getRevenueStreams,
  getForecastLines,
  getHeadcountPlans,
  getFundingRounds,
} from "../data";

// ── Fixture IDs ───────────────────────────────────────────────────────────────

const COMPANY_ID        = "company-phase4a-001";
const SCENARIO_ID       = "scenario-phase4a-001";
const STREAM_ID         = "stream-base-001";
const HEADCOUNT_ID      = "headcount-base-001";
const ROUND_ID          = "round-base-001";
const CREATED_LINE_ID   = "11111111-1111-4111-a111-111111111111";

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetFixtures();
  // Every test needs the scenario row so companyId lookups succeed.
  fixtures.scenarios.push({
    id: SCENARIO_ID,
    companyId: COMPANY_ID,
    name: "Base Case",
    status: "active",
    deletedAt: null,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("scenario read-path resolver wiring (Phase 4 A)", () => {
  it("getRevenueStreams returns the override name when scenarioId has a modify override", async () => {
    // Arrange: base stream in DB
    fixtures.revenueStreams.push({
      id: STREAM_ID,
      companyId: COMPANY_ID,
      name: "Original Stream",
    });
    // Arrange: scenario override that renames it
    fixtures.scenarioOverrides.push({
      scenarioId: SCENARIO_ID,
      entityType: "revenue_stream",
      entityId: STREAM_ID,
      action: "modify",
      data: { id: STREAM_ID, name: "Modified In Scenario" },
    });

    const streams = await getRevenueStreams(SCENARIO_ID);
    const target = streams.find((s: Row) => s.id === STREAM_ID);

    // BUG: getRevenueStreams never calls resolveEntities(), so it returns
    // the base row unchanged. Expected "Modified In Scenario", got "Original Stream".
    // This test must FAIL until T2 wires the resolver in.
    expect(target?.name).toBe("Modified In Scenario");
  });

  it("getForecastLines returns scenario-created lines", async () => {
    // Arrange: no base forecast lines — the create override IS the new row.
    fixtures.scenarioOverrides.push({
      scenarioId: SCENARIO_ID,
      entityType: "forecast_line",
      entityId: CREATED_LINE_ID,
      action: "create",
      data: {
        id: CREATED_LINE_ID,
        companyId: COMPANY_ID,
        method: "fixed",
        parameters: { amount: 5000 },
      },
    });

    const lines = await getForecastLines(SCENARIO_ID);

    // BUG: getForecastLines only queries the base forecastLines table.
    // Create overrides live in scenarioOverrides and are never merged in.
    // This test must FAIL until T3 wires the resolver in.
    expect(lines.some((l: Row) => l.id === CREATED_LINE_ID)).toBe(true);
  });

  it("getHeadcountPlans excludes scenario-deleted rows", async () => {
    // Arrange: base headcount plan exists in DB
    fixtures.headcountPlans.push({
      id: HEADCOUNT_ID,
      companyId: COMPANY_ID,
      title: "Should be deleted",
    });
    // Arrange: scenario override marks it deleted
    fixtures.scenarioOverrides.push({
      scenarioId: SCENARIO_ID,
      entityType: "headcount_plan",
      entityId: HEADCOUNT_ID,
      action: "delete",
      data: null,
    });

    const plans = await getHeadcountPlans(SCENARIO_ID);

    // BUG: getHeadcountPlans returns all base rows without applying deletes.
    // The deleted plan will be present in the result.
    // This test must FAIL until T4 wires the resolver in.
    expect(plans.some((p: Row) => p.id === HEADCOUNT_ID)).toBe(false);
  });

  it("getFundingRounds with scenarioId merges modify overrides", async () => {
    // Arrange: base funding round
    fixtures.fundingRounds.push({
      id: ROUND_ID,
      companyId: COMPANY_ID,
      name: "Original Round",
      amount: "1000000",
    });
    // Arrange: scenario override that renames it and increases amount
    fixtures.scenarioOverrides.push({
      scenarioId: SCENARIO_ID,
      entityType: "funding_round",
      entityId: ROUND_ID,
      action: "modify",
      data: {
        id: ROUND_ID,
        name: "Scenario-Renamed Round",
        amount: "2000000",
      },
    });

    // BUG: getFundingRounds currently takes only (companyId). It has no
    // scenarioId parameter at all. After T5, it must accept (companyId, scenarioId)
    // and call resolveEntities(). The cast forces the call through TypeScript.
    const rounds = await (getFundingRounds as (a: string, b: string) => Promise<Row[]>)(
      COMPANY_ID,
      SCENARIO_ID,
    );
    const target = rounds.find((r: Row) => r.id === ROUND_ID);

    expect(target?.name).toBe("Scenario-Renamed Round");
    expect(target?.amount).toBe("2000000");
  });

  it("getFundingRounds with null scenarioId returns base only (data-room behavior)", async () => {
    // Arrange: base round
    fixtures.fundingRounds.push({
      id: ROUND_ID,
      companyId: COMPANY_ID,
      name: "Base Round",
      amount: "1000000",
    });
    // Arrange: scenario override that would rename it
    fixtures.scenarioOverrides.push({
      scenarioId: SCENARIO_ID,
      entityType: "funding_round",
      entityId: ROUND_ID,
      action: "modify",
      data: { id: ROUND_ID, name: "Should Not Appear" },
    });

    // With null scenarioId the data-room path returns base rows only.
    // BUG: getFundingRounds has no scenarioId param — the second arg is
    // silently ignored, so today's signature change itself is the regression.
    // After T5, (companyId, null) must return base rows (this test must pass
    // after the fix and also confirm the current behavior is broken).
    const rounds = await (getFundingRounds as (a: string, b: null) => Promise<Row[]>)(
      COMPANY_ID,
      null,
    );
    const target = rounds.find((r: Row) => r.id === ROUND_ID);

    // BUG: getFundingRounds currently queries by companyId only and returns
    // base rows, BUT since the second arg is silently dropped the result
    // actually contains the right data. However the signature itself must
    // change — callers that currently pass (companyId) will need updating.
    // This test documents the expected behavior after T5.
    expect(target?.name).toBe("Base Round");
  });
});
