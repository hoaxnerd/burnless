import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
} from "../queries/scenario-mutations";
import { getOverridesForScenario } from "../queries/scenario-overrides";
import {
  createCompanyContext,
  createDepartment,
  createFinancialAccount,
  createRevenueStream,
  createScenarioOverride,
} from "./factories";
import { departments, revenueStreams, financialAccounts } from "../schema";

// ── scenarioInsert ────────────────────────────────────────────────────────────

describe("scenarioInsert", () => {
  it("no scenario (null) inserts to base table directly and returns inserted row", async () => {
    const ctx = await createCompanyContext({
      user: { email: "insert-base@test.burnless.app" },
      company: { name: "Insert Base Co" },
    });

    const row = await scenarioInsert("revenue_stream", revenueStreams, {
      companyId: ctx.company.id,
      name: "Direct Insert Stream",
    }, null);

    expect(row).toBeDefined();
    expect(row.name).toBe("Direct Insert Stream");
    expect(row.companyId).toBe(ctx.company.id);
    expect(row.id).toBeDefined();
  });

  it("active scenario creates override with action=create and generated UUID", async () => {
    const ctx = await createCompanyContext({
      user: { email: "insert-scenario@test.burnless.app" },
      company: { name: "Insert Scenario Co" },
    });

    const row = await scenarioInsert("revenue_stream", revenueStreams, {
      companyId: ctx.company.id,
      name: "Scenario Stream",
    }, ctx.scenario.id);

    expect(row).toBeDefined();
    expect(row.id).toBeDefined();
    expect(row.name).toBe("Scenario Stream");

    // Verify an override was created
    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("create");
    expect(overrides[0]!.entityId).toBe(row.id);
  });

  it("override data matches provided values", async () => {
    const ctx = await createCompanyContext({
      user: { email: "insert-data@test.burnless.app" },
      company: { name: "Insert Data Co" },
    });

    const inputData = {
      companyId: ctx.company.id,
      name: "Data Match Stream",
    };

    const row = await scenarioInsert("revenue_stream", revenueStreams, inputData, ctx.scenario.id);

    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
    const overrideData = overrides[0]!.data as Record<string, unknown>;
    expect(overrideData.name).toBe("Data Match Stream");
    expect(overrideData.companyId).toBe(ctx.company.id);
    expect(overrideData.id).toBe(row.id);
  });
});

// ── scenarioUpdate ────────────────────────────────────────────────────────────

describe("scenarioUpdate", () => {
  it("no scenario updates base table directly", async () => {
    const ctx = await createCompanyContext({
      user: { email: "update-base@test.burnless.app" },
      company: { name: "Update Base Co" },
    });
    const stream = await createRevenueStream(ctx.company.id, { name: "Original Name" });

    const updated = await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      stream.id,
      { name: "Updated Name" },
      null,
    );

    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Updated Name");
  });

  it("active scenario, first override creates override with action=modify and captures original", async () => {
    const ctx = await createCompanyContext({
      user: { email: "update-first@test.burnless.app" },
      company: { name: "Update First Co" },
    });
    const stream = await createRevenueStream(ctx.company.id, { name: "Base Stream" });

    const result = await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      stream.id,
      { name: "Modified Stream" },
      ctx.scenario.id,
    );

    expect(result!.name).toBe("Modified Stream");

    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("modify");
    expect(overrides[0]!.entityId).toBe(stream.id);

    // originalData should be the base entity snapshot
    const original = overrides[0]!.originalData as Record<string, unknown>;
    expect(original.name).toBe("Base Stream");
  });

  it("active scenario, existing override updates override data (last-write-wins)", async () => {
    const ctx = await createCompanyContext({
      user: { email: "update-existing@test.burnless.app" },
      company: { name: "Update Existing Co" },
    });
    const stream = await createRevenueStream(ctx.company.id, { name: "Base Stream" });

    // First update creates the override
    await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      stream.id,
      { name: "First Edit" },
      ctx.scenario.id,
    );

    // Second update should upsert the same override
    const result = await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      stream.id,
      { name: "Second Edit" },
      ctx.scenario.id,
    );

    expect(result!.name).toBe("Second Edit");

    // Should still be only one override
    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
    const data = overrides[0]!.data as Record<string, unknown>;
    expect(data.name).toBe("Second Edit");
  });

  it("partial parameters update preserves unmodified JSONB keys", async () => {
    const ctx = await createCompanyContext({
      user: { email: "update-params-merge@test.burnless.app" },
      company: { name: "Params Merge Co" },
    });
    const stream = await createRevenueStream(ctx.company.id, {
      name: "SaaS",
      type: "subscription",
      parameters: {
        monthlyPrice: 50,
        startingCustomers: 100,
        newCustomersPerMonth: 10,
        monthlyChurnRate: 0.05,
      },
    });

    // AI-style partial update: change only one field inside parameters
    const result = await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      stream.id,
      { parameters: { expansionRate: 0.02 } },
      ctx.scenario.id,
    );

    const resultParams = (result as { parameters: Record<string, number> }).parameters;
    expect(resultParams.expansionRate).toBe(0.02);
    expect(resultParams.monthlyPrice).toBe(50);
    expect(resultParams.startingCustomers).toBe(100);
    expect(resultParams.newCustomersPerMonth).toBe(10);
    expect(resultParams.monthlyChurnRate).toBe(0.05);

    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    const stored = (overrides[0]!.data as { parameters: Record<string, number> }).parameters;
    expect(stored.expansionRate).toBe(0.02);
    expect(stored.monthlyPrice).toBe(50);
    expect(stored.monthlyChurnRate).toBe(0.05);
  });

  it("partial parameters update on existing override preserves prior partial edits", async () => {
    const ctx = await createCompanyContext({
      user: { email: "update-params-merge2@test.burnless.app" },
      company: { name: "Params Merge Two Co" },
    });
    const stream = await createRevenueStream(ctx.company.id, {
      name: "SaaS",
      type: "subscription",
      parameters: { monthlyPrice: 50, startingCustomers: 100 },
    });

    // First partial update
    await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      stream.id,
      { parameters: { expansionRate: 0.02 } },
      ctx.scenario.id,
    );

    // Second partial update: different field inside parameters
    const result = await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      stream.id,
      { parameters: { priceGrowthRate: 0.01 } },
      ctx.scenario.id,
    );

    const resultParams = (result as { parameters: Record<string, number> }).parameters;
    expect(resultParams.expansionRate).toBe(0.02);
    expect(resultParams.priceGrowthRate).toBe(0.01);
    expect(resultParams.monthlyPrice).toBe(50);
    expect(resultParams.startingCustomers).toBe(100);
  });

  it("isSystem financial account throws error", async () => {
    const ctx = await createCompanyContext({
      user: { email: "update-system@test.burnless.app" },
      company: { name: "Update System Co" },
    });
    const sysAccount = await createFinancialAccount(ctx.company.id, {
      name: "System Account",
      isSystem: true,
    });

    await expect(
      scenarioUpdate(
        "financial_account",
        financialAccounts,
        sysAccount.id,
        { name: "Hacked" },
        ctx.scenario.id,
      ),
    ).rejects.toThrow("System accounts cannot be modified in scenarios");
  });
});

// ── scenarioDelete ────────────────────────────────────────────────────────────

describe("scenarioDelete", () => {
  it("no scenario deletes from base table", async () => {
    const ctx = await createCompanyContext({
      user: { email: "delete-base@test.burnless.app" },
      company: { name: "Delete Base Co" },
    });
    const stream = await createRevenueStream(ctx.company.id, { name: "Delete Me" });

    await scenarioDelete("revenue_stream", revenueStreams, stream.id, null);

    // Verify the row is gone from the base table
    const db = getTestDb();
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(revenueStreams).where(eq(revenueStreams.id, stream.id));
    expect(rows).toHaveLength(0);
  });

  it("active scenario, base entity creates delete override with data=null", async () => {
    const ctx = await createCompanyContext({
      user: { email: "delete-scenario@test.burnless.app" },
      company: { name: "Delete Scenario Co" },
    });
    const stream = await createRevenueStream(ctx.company.id, { name: "Hide Me" });

    await scenarioDelete("revenue_stream", revenueStreams, stream.id, ctx.scenario.id);

    const overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("delete");
    expect(overrides[0]!.data).toBeNull();
    expect(overrides[0]!.entityId).toBe(stream.id);

    // Original data should be preserved
    const original = overrides[0]!.originalData as Record<string, unknown>;
    expect(original.name).toBe("Hide Me");
  });

  it("active scenario, scenario-created entity removes override row entirely", async () => {
    const ctx = await createCompanyContext({
      user: { email: "delete-created@test.burnless.app" },
      company: { name: "Delete Created Co" },
    });

    // Create entity via scenario (creates a "create" override)
    const entityData = await scenarioInsert("revenue_stream", revenueStreams, {
      companyId: ctx.company.id,
      name: "Ephemeral Stream",
    }, ctx.scenario.id);

    // Verify override exists
    let overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("create");

    // Delete the scenario-created entity
    await scenarioDelete("revenue_stream", revenueStreams, entityData.id, ctx.scenario.id);

    // Override should be gone entirely (not converted to action=delete)
    overrides = await getOverridesForScenario(ctx.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(0);
  });

  it("department delete cascades to child departments", async () => {
    const ctx = await createCompanyContext({
      user: { email: "delete-cascade@test.burnless.app" },
      company: { name: "Delete Cascade Co" },
    });

    const parent = await createDepartment(ctx.company.id, { name: "Engineering" });
    const child1 = await createDepartment(ctx.company.id, {
      name: "Frontend",
      parentId: parent.id,
    });
    const child2 = await createDepartment(ctx.company.id, {
      name: "Backend",
      parentId: parent.id,
    });

    await scenarioDelete("department", departments, parent.id, ctx.scenario.id);

    // Should have delete overrides for parent + both children
    const overrides = await getOverridesForScenario(ctx.scenario.id, "department");
    expect(overrides).toHaveLength(3);

    const entityIds = overrides.map((o) => o.entityId).sort();
    const expectedIds = [parent.id, child1.id, child2.id].sort();
    expect(entityIds).toEqual(expectedIds);

    // All should be action=delete
    expect(overrides.every((o) => o.action === "delete")).toBe(true);
  });
});
