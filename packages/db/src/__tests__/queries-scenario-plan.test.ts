import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  planScenarioInsert,
  commitScenarioPlan,
  type ScenarioPlan,
} from "../queries/scenario-mutations";
import { getOverridesForScenario } from "../queries/scenario-overrides";
import { createCompanyContext } from "./factories";
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
