import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  planScenarioInsert,
  planScenarioUpdate,
  commitScenarioPlan,
  type ScenarioPlan,
} from "../queries/scenario-mutations";
import { getOverridesForScenario } from "../queries/scenario-overrides";
import { createCompanyContext, createRevenueStream, createScenarioOverride, createFundingRound } from "./factories";
import { revenueStreams } from "../schema";

describe("planScenarioInsert", () => {
  it("returns a create delta WITHOUT writing an override", async () => {
    const ctx = await createCompanyContext({
      user: { email: "plan-insert@test.burnless.app" },
      company: { name: "Plan Insert Co" },
    });

    const plan = await planScenarioInsert(
      "revenue_stream",
      revenueStreams,
      { companyId: ctx.company.id, name: "Planned Stream" },
      ctx.scenario.id,
      ctx.company.id,
    );

    expect(plan.action).toBe("create");
    expect(plan.entityType).toBe("revenue_stream");
    expect(plan.before).toBeNull();
    expect((plan.after as { name: string }).name).toBe("Planned Stream");
    expect((plan.after as { id: string }).id).toBe(plan.entityId);
    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(0);
  });

  it("commitScenarioPlan(create) persists the override the plan described", async () => {
    const ctx = await createCompanyContext({
      user: { email: "commit-insert@test.burnless.app" },
      company: { name: "Commit Insert Co" },
    });
    const plan = await planScenarioInsert(
      "revenue_stream",
      revenueStreams,
      { companyId: ctx.company.id, name: "Committed Stream" },
      ctx.scenario.id,
      ctx.company.id,
    );
    await commitScenarioPlan(ctx.scenario.id, plan);

    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("create");
    expect(overrides[0]!.entityId).toBe(plan.entityId);
    expect((overrides[0]!.data as { name: string }).name).toBe("Committed Stream");
  });

  it("rejects plan mode with no scenario", async () => {
    const ctx = await createCompanyContext({
      user: { email: "plan-noscenario@test.burnless.app" },
      company: { name: "Plan NoScenario Co" },
    });
    await expect(
      // @ts-expect-error — exercising the runtime guard for a null scenarioId
      planScenarioInsert("revenue_stream", revenueStreams, { companyId: ctx.company.id, name: "x" }, null, ctx.company.id),
    ).rejects.toThrow(/scenario/i);
  });
});

describe("planScenarioUpdate", () => {
  it("first override: modify delta snapshots base as before, merges into after, no write", async () => {
    const ctx = await createCompanyContext({
      user: { email: "plan-update@test.burnless.app" },
      company: { name: "Plan Update Co" },
    });
    const base = await createRevenueStream(ctx.company.id, { name: "Base Stream" });

    const plan = await planScenarioUpdate(
      "revenue_stream",
      revenueStreams,
      base.id,
      { name: "Renamed Stream" },
      ctx.scenario.id,
      ctx.company.id,
    );

    expect(plan.action).toBe("modify");
    expect(plan.entityId).toBe(base.id);
    expect((plan.before as { name: string }).name).toBe("Base Stream");
    expect((plan.after as { name: string }).name).toBe("Renamed Stream");
    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(0);
  });

  it("existing override: preserves the override's action + originalData, merges into after", async () => {
    const ctx = await createCompanyContext({
      user: { email: "plan-update-existing@test.burnless.app" },
      company: { name: "Plan Update Existing Co" },
    });
    const base = await createRevenueStream(ctx.company.id, { name: "Base" });
    // Positional: (scenarioId, entityType, entityId, action, data?, originalData?)
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      base.id,
      "modify",
      { id: base.id, name: "First Edit", companyId: ctx.company.id },
      { id: base.id, name: "Base", companyId: ctx.company.id },
    );

    const plan = await planScenarioUpdate(
      "revenue_stream",
      revenueStreams,
      base.id,
      { name: "Second Edit" },
      ctx.scenario.id,
      ctx.company.id,
    );

    expect(plan.action).toBe("modify");
    expect((plan.before as { name: string }).name).toBe("Base");
    expect((plan.after as { name: string }).name).toBe("Second Edit");
  });

  it("strips immutable funding_round roundType from the after delta (Phase 2 D §1.2)", async () => {
    const ctx = await createCompanyContext({
      user: { email: "plan-roundtype@test.burnless.app" },
      company: { name: "Plan RoundType Co" },
    });
    const round = await createFundingRound(ctx.company.id, { type: "seed", name: "Seed" });

    const { fundingRounds } = await import("../schema");
    const plan = await planScenarioUpdate(
      "funding_round",
      fundingRounds,
      round.id,
      { type: "series_a", name: "Renamed" } as Record<string, unknown>,
      ctx.scenario.id,
      ctx.company.id,
    );
    expect((plan.after as { type?: string }).type).toBe("seed"); // unchanged — strip worked
    expect((plan.after as { name: string }).name).toBe("Renamed");
  });

  it("re-updating a scenario-created entity preserves action 'create'", async () => {
    const ctx = await createCompanyContext({
      user: { email: "plan-update-created@test.burnless.app" },
      company: { name: "Plan Update Created Co" },
    });
    const id = crypto.randomUUID();
    // A scenario-created entity: an override with action "create", no base row.
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      id,
      "create",
      { id, name: "Created In Scenario", companyId: ctx.company.id },
      null,
    );

    const plan = await planScenarioUpdate(
      "revenue_stream",
      revenueStreams,
      id,
      { name: "Edited Again" },
      ctx.scenario.id,
      ctx.company.id,
    );

    expect(plan.action).toBe("create"); // preserved, not downgraded to "modify"
    expect(plan.before).toBeNull();      // create override has null originalData
    expect((plan.after as { name: string }).name).toBe("Edited Again");
  });
});
