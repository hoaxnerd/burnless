import { eq } from "drizzle-orm";
import { PgTimestamp } from "drizzle-orm/pg-core";
import { db } from "../index";
import {
  scenarios,
  scenarioOverrides,
  revenueStreams,
  headcountPlans,
  forecastLines,
  fundingRounds,
  departments,
  financialAccounts,
  salaryChanges,
  bonuses,
  equityGrants,
} from "../schema";

// Map entity_type strings to Drizzle table references
function getTableForEntityType(entityType: string) {
  const map: Record<string, any> = {
    revenue_stream: revenueStreams,
    headcount_plan: headcountPlans,
    forecast_line: forecastLines,
    funding_round: fundingRounds,
    department: departments,
    financial_account: financialAccounts,
    salary_change: salaryChanges,
    bonus: bonuses,
    equity_grant: equityGrants,
  };
  const table = map[entityType];
  if (!table) throw new Error(`Unknown entity type: ${entityType}`);
  return table;
}

/**
 * Rehydrate JSONB data for a Drizzle table: convert ISO date strings back to
 * Date objects for timestamp columns so that Drizzle's driver mapping works.
 */
function rehydrateForTable(table: any, data: Record<string, any>): Record<string, any> {
  const result = { ...data };
  const columns = table[Symbol.for("drizzle:Columns")] ?? table;
  for (const [key, col] of Object.entries(columns)) {
    if (col instanceof PgTimestamp && typeof result[key] === "string") {
      result[key] = new Date(result[key]);
    }
  }
  return result;
}

export async function promoteScenario(scenarioId: string, companyId: string) {
  return db.transaction(async (tx) => {
    // 1. Create backup scenario
    const [backup] = await tx
      .insert(scenarios)
      .values({
        companyId,
        name: `Backup (pre-promote, ${new Date().toLocaleDateString()})`,
        source: "backup",
        status: "active",
        sourceScenarioId: scenarioId,
        autoDeleteAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })
      .returning();

    // 2. Get affected entity types from this scenario's overrides
    const affectedTypes = await tx
      .selectDistinct({ entityType: scenarioOverrides.entityType })
      .from(scenarioOverrides)
      .where(eq(scenarioOverrides.scenarioId, scenarioId));

    // 3. For each affected type, snapshot base entities into backup
    for (const { entityType } of affectedTypes) {
      const table = getTableForEntityType(entityType);
      const baseEntities = await tx
        .select()
        .from(table)
        .where(eq(table.companyId, companyId));
      for (const entity of baseEntities) {
        await tx.insert(scenarioOverrides).values({
          scenarioId: backup!.id,
          entityType,
          entityId: entity.id,
          action: "modify",
          data: entity,
          originalData: entity,
        });
      }
    }

    // 4. Load and apply all overrides
    const overrides = await tx
      .select()
      .from(scenarioOverrides)
      .where(eq(scenarioOverrides.scenarioId, scenarioId));

    for (const override of overrides) {
      const table = getTableForEntityType(override.entityType);
      if (override.action === "modify") {
        const hydrated = rehydrateForTable(table, override.data as Record<string, any>);
        // Try UPDATE first
        await tx
          .update(table)
          .set(hydrated)
          .where(eq(table.id, override.entityId));
        // Check if the row exists — if not, the base entity was deleted (dangling override)
        const [exists] = await tx
          .select({ id: table.id })
          .from(table)
          .where(eq(table.id, override.entityId));
        if (!exists) {
          await tx.insert(table).values(hydrated);
        }
      } else if (override.action === "create") {
        const hydrated = rehydrateForTable(table, override.data as Record<string, any>);
        await tx.insert(table).values(hydrated);
      } else if (override.action === "delete") {
        await tx.delete(table).where(eq(table.id, override.entityId));
      }
    }

    // 5. Archive the scenario
    await tx
      .update(scenarios)
      .set({
        status: "promoted",
        promotedAt: new Date(),
      })
      .where(eq(scenarios.id, scenarioId));

    return { backup: backup!, promotedScenarioId: scenarioId };
  });
}
