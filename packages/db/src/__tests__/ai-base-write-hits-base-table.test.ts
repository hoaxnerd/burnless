/**
 * GUARD TEST — AI-01 (RED phase, TDD).
 *
 * Contract under test:
 *   An AI "add revenue stream" performed with NO active scenario (Base view —
 *   no `active-scenario-id` cookie / `body.scenarioId` null) must land in the
 *   BASE `revenue_streams` table, visible to a base-view read, and must create
 *   ZERO `scenario_overrides` rows.
 *
 * The real defect (AI-01) lives in apps/web/src/app/api/chat/route.ts: the chat
 * route ALWAYS resolves a concrete scenario for the turn — when `body.scenarioId`
 * is null it falls back to `getDefaultScenario(companyId)` (the oldest "Base
 * Case" scenario) and then passes that non-null `scenario.id` verbatim as the
 * WRITE target into the tool ToolContext → mutateInsert → scenarioInsert. With a
 * non-null Base-Case id, `scenarioInsert` writes a `scenario_overrides`
 * (action=create) row instead of a base-table row — so the new revenue stream is
 * invisible on the base Revenue page (GET /api/revenue-streams sends no
 * X-Scenario-Id).
 *
 * The default scenario is needed for READ context (buildAiContext); it must NOT
 * be used as the WRITE target.
 *
 * CAVEAT / APPROXIMATION (see lane brief): importing the Next.js chat route
 * handler into a packages/db PGLite test is impractical (it pulls auth,
 * rate-limit, SSE, the AI provider stack, and apps/web-only modules). Instead
 * this test reproduces the chat route's exact write-target resolution at the
 * query layer — the same `getDefaultScenario` fallback the route uses — and
 * drives the real `scenarioInsert` write path with it. This is the same code
 * AI-01 names; the only thing stubbed is the SSE/provider plumbing around it.
 *
 * Expected status NOW: RED.
 *   - resolveChatWriteTarget(...) currently returns the Base-Case scenario id
 *     (mirroring route.ts:128-141 → 168), so the assertion that it is `null`
 *     fails.
 *   - Driven through scenarioInsert with that non-null id, the row is written as
 *     an override, so the base-table / zero-overrides assertions fail too.
 * When the route is fixed to use `null` as the write target for the base view,
 * all three turn GREEN.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { getTestDb } from "./setup";

// Route the query layer (`db` imported from ../index by scenario-mutations /
// scenario-resolver / scenario queries) at the shared PGLite test instance, so
// factory writes and query-layer reads/writes hit the same in-memory database.
// Mirrors queries-scenario-resolver.test.ts.
vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  getDefaultScenario,
  scenarioInsert,
  getResolvedData,
} from "../queries";
import { revenueStreams, scenarioOverrides } from "../schema";
import { createCompanyContext, createScenario } from "./factories";

/**
 * Replicates the chat route's scenario WRITE-TARGET resolution.
 *
 * Mirrors apps/web/src/app/api/chat/route.ts:128-141 (resolve scenario, falling
 * back to getDefaultScenario when body.scenarioId is null) and route.ts:168
 * (the id that flows into ToolContext.scenarioId — i.e. the write target).
 *
 * Returns the id that the chat route would actually thread into the tool
 * handlers as the mutation target.
 *
 * The bug: for the base view (bodyScenarioId === null), this returns the default
 * scenario's id instead of `null`. The READ context can use the default
 * scenario, but the WRITE target must be `null`.
 *
 * NOTE: this helper is intentionally written to match the CURRENT route
 * behavior so the test fails RED. When the route is fixed, update this helper to
 * mirror the fixed resolution (return null for the base view) and the test goes
 * GREEN — keeping the helper a faithful mirror of the route is the contract.
 */
async function resolveChatWriteTarget(
  companyId: string,
  bodyScenarioId: string | null,
): Promise<string | null> {
  // Base view: body.scenarioId is null. route.ts:135-137 takes the
  // getDefaultScenario(companyId) fallback (the oldest "Base Case" scenario).
  // For an explicit bodyScenarioId the route would look it up and fall back to
  // the default if not found (route.ts:130-134); this test only exercises the
  // base-view (null) branch, which is where the defect lives.
  const scenario = bodyScenarioId
    ? null /* not exercised here */
    : await getDefaultScenario(companyId);
  // route.ts:168 — scenario.id is passed verbatim as the write target
  // (ToolContext.scenarioId → mutateInsert → scenarioInsert).
  return scenario ? scenario.id : null;
}

describe("AI-01: AI base write (no active scenario) must hit the base table, not an override", () => {
  let companyId: string;

  beforeAll(async () => {
    const ctx = await createCompanyContext({
      company: { name: "AI-01 Base-Write Co" },
      // The composite helper creates the oldest scenario — this is the
      // "Base Case" that getDefaultScenario returns as the fallback.
      scenario: { name: "Base Case", source: "blank", status: "active" },
    });
    companyId = ctx.company.id;
    // A second, newer scenario to prove getDefaultScenario picks the OLDEST
    // (the Base Case) — the exact scenario the route mis-targets writes to.
    await createScenario(companyId, {
      name: "Aggressive Hiring",
      source: "blank",
      status: "active",
      createdAt: new Date(Date.now() + 60_000),
    });
  });

  it("resolves a NULL write-target when no scenario is active (route must not write to the Base Case)", async () => {
    // This is the core defect: with no active scenario the chat route resolves
    // the Base-Case scenario id as the WRITE target. The write target must be
    // null so the tool handler writes to the base table.
    const writeTarget = await resolveChatWriteTarget(companyId, null);

    expect(
      writeTarget,
      `Chat route resolved write-target=${JSON.stringify(writeTarget)} for the base view (no active scenario). ` +
        `Expected null. The default scenario (Base Case) is correct for READ context but must NOT be the WRITE target — ` +
        `a non-null id routes scenarioInsert into scenario_overrides (action=create), invisible on the base Revenue page. ` +
        `Offending source: apps/web/src/app/api/chat/route.ts:128-141 (getDefaultScenario fallback) → route.ts:168 (scenario.id passed as ToolContext.scenarioId).`,
    ).toBeNull();
  });

  it("writes the revenue stream to the BASE table and creates ZERO overrides (base-view AI add)", async () => {
    // Drive the REAL write path (scenarioInsert — the function mutateInsert
    // calls) using the write target the route would resolve for the base view.
    const writeTarget = await resolveChatWriteTarget(companyId, null);

    const inserted = await scenarioInsert(
      "revenue_stream",
      revenueStreams,
      {
        companyId,
        name: "AI Added Stream (base view)",
        type: "subscription",
        startDate: new Date("2026-07-01"),
        endDate: null,
        parameters: {},
      },
      writeTarget, // null when fixed; Base-Case id while the bug exists
      companyId,
    );
    expect(inserted).toBeTruthy();

    const db = getTestDb();

    // 1) The row must exist in the BASE revenue_streams table.
    const baseRows = await db
      .select({ id: revenueStreams.id, name: revenueStreams.name })
      .from(revenueStreams)
      .where(
        and(
          eq(revenueStreams.companyId, companyId),
          eq(revenueStreams.name, "AI Added Stream (base view)"),
        ),
      );

    // 2) ZERO scenario_overrides rows for this company's scenarios.
    const overrideRows = await db.select().from(scenarioOverrides);

    const offenders = overrideRows
      .filter((o) => o.entityType === "revenue_stream")
      .map((o) => `scenario_overrides{scenarioId:${o.scenarioId}, action:${o.action}, entityId:${o.entityId}}`);

    expect(
      baseRows.length,
      `Base view AI add did not write to the base revenue_streams table (found ${baseRows.length} matching base rows). ` +
        `It was committed as a scenario override instead. Override offenders: ${JSON.stringify(offenders)}. ` +
        `Root: apps/web/src/lib/ai-tools/scenario-mutate.ts:39 forwards ctx.scenarioId (the Base-Case id) to scenarioInsert; ` +
        `packages/db/src/queries/scenario-mutations.ts:275-278 only writes the base table when scenarioId is null.`,
    ).toBe(1);

    expect(
      offenders.length,
      `Expected ZERO revenue_stream scenario_overrides after a base-view AI add, but found ${offenders.length}: ${JSON.stringify(offenders)}.`,
    ).toBe(0);
  });

  it("the new stream is visible to a base-view (scenarioId=null) read", async () => {
    // The Revenue page reads base data with no X-Scenario-Id (getResolvedData
    // with scenarioId=null). The AI-added stream must appear there.
    const resolved = await getResolvedData(companyId, null);
    const names = resolved.revenueStreams.map((r) => r.name);

    expect(
      names,
      `Base-view read (getResolvedData(companyId, null)) did not surface the AI-added stream. ` +
        `Visible base streams: ${JSON.stringify(names)}. ` +
        `If the AI write landed as a Base-Case override, it is invisible to the base Revenue page — exactly the AI-01 symptom.`,
    ).toContain("AI Added Stream (base view)");
  });
});
