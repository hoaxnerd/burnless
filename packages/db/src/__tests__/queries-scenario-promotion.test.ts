import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { promoteScenario } from "../queries/scenario-promotion";
import { getOverridesForScenario } from "../queries/scenario-overrides";
import {
  createCompanyContext,
  createRevenueStream,
  createFundingRound,
  createDepartment,
  createHeadcountPlan,
  createScenarioOverride,
} from "./factories";
import {
  scenarios,
  scenarioOverrides,
  revenueStreams,
  fundingRounds,
} from "../schema";

// ── promoteScenario ──────────────────────────────────────────────────────────

describe("promoteScenario", () => {
  it("creates backup scenario with source=backup and auto_delete_at 7 days from now", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-backup@test.burnless.app" },
      company: { name: "Promote Backup Co" },
    });

    // Create a revenue stream and a modify override
    const stream = await createRevenueStream(ctx.company.id, { name: "Original" });
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "modify",
      { ...stream, name: "Modified" },
      stream as any,
    );

    const before = Date.now();
    const result = await promoteScenario(ctx.scenario.id, ctx.company.id);
    const after = Date.now();

    expect(result.backup).toBeDefined();
    expect(result.backup.source).toBe("backup");
    expect(result.backup.sourceScenarioId).toBe(ctx.scenario.id);
    expect(result.backup.companyId).toBe(ctx.company.id);

    // auto_delete_at should be ~7 days from now
    const deleteAt = result.backup.autoDeleteAt!.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(deleteAt).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(deleteAt).toBeLessThanOrEqual(after + sevenDays + 1000);
  });

  it("backup contains base entities for affected entity types only", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-affected@test.burnless.app" },
      company: { name: "Promote Affected Co" },
    });

    // Create entities in two different types
    const stream = await createRevenueStream(ctx.company.id, { name: "Stream A" });
    const round = await createFundingRound(ctx.company.id, { name: "Seed Round" });

    // Only create an override for revenue_stream — funding_round should NOT be backed up
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "modify",
      { ...stream, name: "Modified Stream" },
      stream as any,
    );

    const result = await promoteScenario(ctx.scenario.id, ctx.company.id);

    // Check backup overrides — should only have revenue_stream entries, not funding_round
    const backupOverrides = await getOverridesForScenario(result.backup.id);
    const backupTypes = [...new Set(backupOverrides.map((o) => o.entityType))];
    expect(backupTypes).toEqual(["revenue_stream"]);
    expect(backupOverrides.some((o) => o.entityType === "funding_round")).toBe(false);

    // Should contain the base entity data for the stream
    const streamBackup = backupOverrides.find((o) => o.entityId === stream.id);
    expect(streamBackup).toBeDefined();
    expect((streamBackup!.data as any).name).toBe("Stream A");
  });

  it("applies modify overrides to base table (UPDATE)", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-modify@test.burnless.app" },
      company: { name: "Promote Modify Co" },
    });

    const stream = await createRevenueStream(ctx.company.id, { name: "Before Promote" });
    const modifiedData = { ...stream, name: "After Promote" };
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "modify",
      modifiedData,
      stream as any,
    );

    await promoteScenario(ctx.scenario.id, ctx.company.id);

    // Verify the base table was updated
    const db = getTestDb();
    const [updated] = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.id, stream.id));
    expect(updated!.name).toBe("After Promote");
  });

  it("applies create overrides to base table (INSERT)", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-create@test.burnless.app" },
      company: { name: "Promote Create Co" },
    });

    const newEntityId = crypto.randomUUID();
    const newEntityData = {
      id: newEntityId,
      companyId: ctx.company.id,
      name: "New Via Scenario",
      type: "subscription",
      parameters: {},
    };
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      newEntityId,
      "create",
      newEntityData,
    );

    await promoteScenario(ctx.scenario.id, ctx.company.id);

    // Verify the entity now exists in the base table
    const db = getTestDb();
    const [inserted] = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.id, newEntityId));
    expect(inserted).toBeDefined();
    expect(inserted!.name).toBe("New Via Scenario");
  });

  it("applies delete overrides to base table (DELETE)", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-delete@test.burnless.app" },
      company: { name: "Promote Delete Co" },
    });

    const stream = await createRevenueStream(ctx.company.id, { name: "Delete Me" });
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "delete",
      null,
      stream as any,
    );

    await promoteScenario(ctx.scenario.id, ctx.company.id);

    // Verify the entity is gone from the base table
    const db = getTestDb();
    const rows = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.id, stream.id));
    expect(rows).toHaveLength(0);
  });

  it("handles dangling modify override (base entity was deleted) — falls back to INSERT", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-dangling@test.burnless.app" },
      company: { name: "Promote Dangling Co" },
    });

    // Create entity, then create a modify override for it
    const stream = await createRevenueStream(ctx.company.id, { name: "Will Be Deleted" });
    const modifiedData = { ...stream, name: "Dangling Override" };
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "modify",
      modifiedData,
      stream as any,
    );

    // Delete the base entity BEFORE promoting (simulates concurrent deletion)
    const db = getTestDb();
    await db.delete(revenueStreams).where(eq(revenueStreams.id, stream.id));

    // Promote — should INSERT instead of UPDATE since the base is gone
    await promoteScenario(ctx.scenario.id, ctx.company.id);

    // Verify the entity was re-inserted with the override data
    const [reinserted] = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.id, stream.id));
    expect(reinserted).toBeDefined();
    expect(reinserted!.name).toBe("Dangling Override");
  });

  it("sets promoted scenario status to 'promoted' with promoted_at timestamp", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-status@test.burnless.app" },
      company: { name: "Promote Status Co" },
    });

    const stream = await createRevenueStream(ctx.company.id, { name: "Status Test" });
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "modify",
      { ...stream, name: "Modified" },
      stream as any,
    );

    const before = new Date();
    await promoteScenario(ctx.scenario.id, ctx.company.id);
    const after = new Date();

    // Verify the scenario was archived
    const db = getTestDb();
    const [promoted] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, ctx.scenario.id));
    expect(promoted!.status).toBe("promoted");
    expect(promoted!.promotedAt).toBeDefined();
    expect(promoted!.promotedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(promoted!.promotedAt!.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it("entire operation is transactional (all-or-nothing)", async () => {
    const ctx = await createCompanyContext({
      user: { email: "promote-txn@test.burnless.app" },
      company: { name: "Promote Txn Co" },
    });

    const stream = await createRevenueStream(ctx.company.id, { name: "Txn Test" });

    // Create an override referencing an unknown entity type to force an error mid-transaction
    await createScenarioOverride(
      ctx.scenario.id,
      "revenue_stream",
      stream.id,
      "modify",
      { ...stream, name: "Good Override" },
      stream as any,
    );
    await createScenarioOverride(
      ctx.scenario.id,
      "unknown_entity_type",
      "fake-id",
      "modify",
      { id: "fake-id", name: "Bad Override" },
    );

    // Promote should throw due to unknown entity type
    await expect(
      promoteScenario(ctx.scenario.id, ctx.company.id),
    ).rejects.toThrow("Unknown entity type: unknown_entity_type");

    // Verify nothing changed — scenario should still be active, no backup created
    const db = getTestDb();
    const [scenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, ctx.scenario.id));
    expect(scenario!.status).toBe("active");
    expect(scenario!.promotedAt).toBeNull();

    // Base table should be unchanged
    const [unchanged] = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.id, stream.id));
    expect(unchanged!.name).toBe("Txn Test");
  });
});
