import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { resolveEntities, getResolvedData } from "../queries/scenario-resolver";
import {
  createCompanyContext,
  createScenarioOverride,
  createRevenueStream,
  createHeadcountPlan,
  createForecastLine,
  createFundingRound,
  createDepartment,
  createFinancialAccount,
} from "./factories";

// ── resolveEntities ──────────────────────────────────────────────────────────

describe("resolveEntities", () => {
  it("no scenario (null) returns base entities unchanged with _override: null", async () => {
    const base = [
      { id: "e1", name: "Alpha" },
      { id: "e2", name: "Beta" },
    ];

    const result = await resolveEntities("revenue_stream", base, null);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "e1", name: "Alpha", _override: null });
    expect(result[1]).toEqual({ id: "e2", name: "Beta", _override: null });
  });

  it("scenario with no overrides returns base entities unchanged", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolve-no-overrides@test.burnless.app" },
      company: { name: "Resolve No Overrides Co" },
    });

    const base = [
      { id: "no-ovr-1", name: "Alpha" },
      { id: "no-ovr-2", name: "Beta" },
    ];

    const result = await resolveEntities(
      "revenue_stream",
      base,
      ctx.scenario.id,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "no-ovr-1", name: "Alpha", _override: null });
    expect(result[1]).toEqual({ id: "no-ovr-2", name: "Beta", _override: null });
  });

  it("modify override replaces base entity with override data, tagged modified", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolve-modify@test.burnless.app" },
      company: { name: "Resolve Modify Co" },
    });

    const base = [
      { id: "mod-entity-1", name: "Original" },
    ];

    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "mod-entity-1",
      "modify",
      { id: "mod-entity-1", name: "Modified" },
      { id: "mod-entity-1", name: "Original" },
    );

    const result = await resolveEntities(
      "revenue_stream",
      base,
      ctx.scenario.id,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Modified");
    expect(result[0]!._override).toBe("modified");
  });

  it("delete override excludes base entity from results", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolve-delete@test.burnless.app" },
      company: { name: "Resolve Delete Co" },
    });

    const base = [
      { id: "del-entity-1", name: "ToDelete" },
      { id: "del-entity-2", name: "ToKeep" },
    ];

    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "del-entity-1",
      "delete",
    );

    const result = await resolveEntities(
      "revenue_stream",
      base,
      ctx.scenario.id,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("del-entity-2");
    expect(result[0]!._override).toBeNull();
  });

  it("create override appends new entity with _override: created", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolve-create@test.burnless.app" },
      company: { name: "Resolve Create Co" },
    });

    const base = [{ id: "existing-1", name: "Existing" }];

    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "new-entity-1",
      "create",
      { id: "new-entity-1", name: "Brand New" },
    );

    const result = await resolveEntities(
      "revenue_stream",
      base,
      ctx.scenario.id,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "existing-1", name: "Existing", _override: null });
    expect(result[1]!.name).toBe("Brand New");
    expect(result[1]!._override).toBe("created");
  });

  it("dangling modify override (base entity missing) is treated as created", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolve-dangling@test.burnless.app" },
      company: { name: "Resolve Dangling Co" },
    });

    // Scenario has a modify override for an entity that no longer exists in base
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "dangling-entity-1",
      "modify",
      { id: "dangling-entity-1", name: "Dangling Modified" },
      { id: "dangling-entity-1", name: "Original" },
    );

    // Base does NOT contain dangling-entity-1
    const base = [{ id: "other-entity", name: "Other" }];

    const result = await resolveEntities(
      "revenue_stream",
      base,
      ctx.scenario.id,
    );

    expect(result).toHaveLength(2);
    // First: the base entity, unchanged
    expect(result[0]).toEqual({ id: "other-entity", name: "Other", _override: null });
    // Second: the dangling modify override, treated as created
    expect(result[1]!.name).toBe("Dangling Modified");
    expect(result[1]!._override).toBe("created");
  });

  it("mixed scenario: base has 5, modifies 1, deletes 1, creates 1 → returns 5 with correct tags", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolve-mixed@test.burnless.app" },
      company: { name: "Resolve Mixed Co" },
    });

    const base = [
      { id: "mix-1", name: "Entity A" },
      { id: "mix-2", name: "Entity B" },
      { id: "mix-3", name: "Entity C" },
      { id: "mix-4", name: "Entity D" },
      { id: "mix-5", name: "Entity E" },
    ];

    // Modify mix-2
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "mix-2",
      "modify",
      { id: "mix-2", name: "Entity B Modified" },
      { id: "mix-2", name: "Entity B" },
    );

    // Delete mix-4
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "mix-4",
      "delete",
    );

    // Create mix-6
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "mix-6",
      "create",
      { id: "mix-6", name: "Entity F Created" },
    );

    const result = await resolveEntities(
      "revenue_stream",
      base,
      ctx.scenario.id,
    );

    // 5 base - 1 deleted + 1 created = 5
    expect(result).toHaveLength(5);

    const byId = new Map(result.map((r) => [r.id, r]));

    // Unchanged entities
    expect(byId.get("mix-1")!._override).toBeNull();
    expect(byId.get("mix-3")!._override).toBeNull();
    expect(byId.get("mix-5")!._override).toBeNull();

    // Modified
    expect(byId.get("mix-2")!._override).toBe("modified");
    expect(byId.get("mix-2")!.name).toBe("Entity B Modified");

    // Deleted — should not be present
    expect(byId.has("mix-4")).toBe(false);

    // Created
    expect(byId.get("mix-6")!._override).toBe("created");
    expect(byId.get("mix-6")!.name).toBe("Entity F Created");
  });
});

// ── getResolvedData ──────────────────────────────────────────────────────────

describe("getResolvedData", () => {
  it("returns base data when scenarioId is null", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolved-data-null@test.burnless.app" },
      company: { name: "Resolved Data Null Co" },
    });

    // Create one entity of each type
    const dept = await createDepartment(ctx.company.id);
    const account = await createFinancialAccount(ctx.company.id);
    await createRevenueStream(ctx.company.id);
    await createHeadcountPlan(ctx.company.id, dept.id);
    await createForecastLine(ctx.company.id, account.id);
    await createFundingRound(ctx.company.id);

    const data = await getResolvedData(ctx.company.id, null);

    expect(data.revenueStreams).toHaveLength(1);
    expect(data.headcountPlans).toHaveLength(1);
    expect(data.forecastLines).toHaveLength(1);
    expect(data.fundingRounds).toHaveLength(1);
    expect(data.departments).toHaveLength(1);
    expect(data.financialAccounts).toHaveLength(1);

    // All should have _override: null
    expect(data.revenueStreams[0]!._override).toBeNull();
    expect(data.headcountPlans[0]!._override).toBeNull();
    expect(data.forecastLines[0]!._override).toBeNull();
    expect(data.fundingRounds[0]!._override).toBeNull();
    expect(data.departments[0]!._override).toBeNull();
    expect(data.financialAccounts[0]!._override).toBeNull();
  });

  it("returns merged data when scenarioId is provided", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolved-data-merged@test.burnless.app" },
      company: { name: "Resolved Data Merged Co" },
    });

    // Create base revenue stream
    const stream = await createRevenueStream(ctx.company.id, {
      name: "Original Stream",
    });

    // Create a modify override for the revenue stream
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "modify",
      { ...stream, name: "Modified Stream" },
      { ...stream, name: "Original Stream" },
    );

    // Create a scenario-only (create) revenue stream
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      "scenario-only-stream",
      "create",
      { id: "scenario-only-stream", name: "New Stream", companyId: ctx.company.id },
    );

    const data = await getResolvedData(ctx.company.id, ctx.scenario.id);

    // 1 base modified + 1 scenario-created = 2
    expect(data.revenueStreams).toHaveLength(2);

    const modified = data.revenueStreams.find((s) => s.id === stream.id);
    expect(modified).toBeDefined();
    expect(modified!.name).toBe("Modified Stream");
    expect(modified!._override).toBe("modified");

    const created = data.revenueStreams.find(
      (s) => s.id === "scenario-only-stream",
    );
    expect(created).toBeDefined();
    expect(created!.name).toBe("New Stream");
    expect(created!._override).toBe("created");
  });

  it("resolves funding_round modify and create overrides", async () => {
    const ctx = await createCompanyContext({
      user: { email: "resolved-funding@test.burnless.app" },
      company: { name: "Resolved Funding Co" },
    });

    const round = await createFundingRound(ctx.company.id, {
      name: "Seed Round",
    });

    await createScenarioOverride(
      ctx.scenario.id,
      "funding_round",
      round.id,
      "modify",
      { ...round, name: "Seed Round (Projected)" },
      { ...round },
    );
    await createScenarioOverride(
      ctx.scenario.id,
      "funding_round",
      "scenario-only-round",
      "create",
      { id: "scenario-only-round", name: "Series A (Projected)", companyId: ctx.company.id },
    );

    const data = await getResolvedData(ctx.company.id, ctx.scenario.id);
    expect(data.fundingRounds).toHaveLength(2);

    const modified = data.fundingRounds.find((r) => r.id === round.id);
    expect(modified!.name).toBe("Seed Round (Projected)");
    expect(modified!._override).toBe("modified");

    const created = data.fundingRounds.find((r) => r.id === "scenario-only-round");
    expect(created!.name).toBe("Series A (Projected)");
    expect(created!._override).toBe("created");
  });
});
