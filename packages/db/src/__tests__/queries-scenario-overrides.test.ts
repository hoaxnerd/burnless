import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  getOverridesForScenario,
  upsertOverride,
  deleteOverride,
  deleteOverrideByEntity,
  getOverrideCount,
} from "../queries/scenario-overrides";
import {
  createCompanyContext,
  createScenarioOverride,
  createScenario,
} from "./factories";

describe("scenario override queries", () => {
  let companyId: string;
  let scenarioId: string;
  let otherCompanyId: string;
  let otherScenarioId: string;

  beforeAll(async () => {
    const ctx = await createCompanyContext({
      user: { email: "override-test@test.burnless.app" },
      company: { name: "Override Co" },
      scenario: { name: "Test Scenario" },
    });
    companyId = ctx.company.id;
    scenarioId = ctx.scenario.id;

    // Create another company for isolation tests
    const ctx2 = await createCompanyContext({
      user: { email: "override-other@test.burnless.app" },
      company: { name: "Other Override Co" },
      scenario: { name: "Other Scenario" },
    });
    otherCompanyId = ctx2.company.id;
    otherScenarioId = ctx2.scenario.id;
  });

  describe("getOverridesForScenario", () => {
    it("returns all overrides for a scenario", async () => {
      const ctx = await createCompanyContext({
        user: { email: "get-all-overrides@test.burnless.app" },
        company: { name: "Get All Overrides Co" },
      });

      await createScenarioOverride(
        ctx.scenario.id,
        "forecast_line",
        "entity-1",
        "modify",
        { amount: 5000 },
      );
      await createScenarioOverride(
        ctx.scenario.id,
        "revenue_stream",
        "entity-2",
        "create",
        { name: "New Stream" },
      );
      await createScenarioOverride(
        ctx.scenario.id,
        "headcount_plan",
        "entity-3",
        "delete",
      );

      const overrides = await getOverridesForScenario(ctx.scenario.id);
      expect(overrides).toHaveLength(3);
    });

    it("filters by entityType when provided", async () => {
      const ctx = await createCompanyContext({
        user: { email: "filter-overrides@test.burnless.app" },
        company: { name: "Filter Overrides Co" },
      });

      await createScenarioOverride(
        ctx.scenario.id,
        "forecast_line",
        "entity-a",
        "modify",
        { amount: 1000 },
      );
      await createScenarioOverride(
        ctx.scenario.id,
        "forecast_line",
        "entity-b",
        "create",
        { amount: 2000 },
      );
      await createScenarioOverride(
        ctx.scenario.id,
        "revenue_stream",
        "entity-c",
        "delete",
      );

      const forecastOverrides = await getOverridesForScenario(
        ctx.scenario.id,
        "forecast_line",
      );
      expect(forecastOverrides).toHaveLength(2);
      expect(forecastOverrides.every((o) => o.entityType === "forecast_line")).toBe(true);

      const revenueOverrides = await getOverridesForScenario(
        ctx.scenario.id,
        "revenue_stream",
      );
      expect(revenueOverrides).toHaveLength(1);
    });
  });

  describe("upsertOverride", () => {
    it("creates new override", async () => {
      const ctx = await createCompanyContext({
        user: { email: "upsert-create@test.burnless.app" },
        company: { name: "Upsert Create Co" },
      });

      const [override] = await upsertOverride(
        ctx.scenario.id,
        "forecast_line",
        "new-entity-1",
        "modify",
        { amount: 9999 },
        { amount: 5000 },
      );

      expect(override).toBeDefined();
      expect(override!.scenarioId).toBe(ctx.scenario.id);
      expect(override!.entityType).toBe("forecast_line");
      expect(override!.entityId).toBe("new-entity-1");
      expect(override!.action).toBe("modify");
      expect(override!.data).toEqual({ amount: 9999 });
      expect(override!.originalData).toEqual({ amount: 5000 });
    });

    it("updates existing override (last-write-wins)", async () => {
      const ctx = await createCompanyContext({
        user: { email: "upsert-update@test.burnless.app" },
        company: { name: "Upsert Update Co" },
      });

      // Create initial override
      const [first] = await upsertOverride(
        ctx.scenario.id,
        "forecast_line",
        "upsert-entity-1",
        "modify",
        { amount: 1000 },
        { amount: 500 },
      );

      // Upsert with new data (same scenario+type+entity)
      const [updated] = await upsertOverride(
        ctx.scenario.id,
        "forecast_line",
        "upsert-entity-1",
        "modify",
        { amount: 2000 },
        { amount: 500 },
      );

      expect(updated!.id).toBe(first!.id); // same row, not a new one
      expect(updated!.data).toEqual({ amount: 2000 });

      // Verify only one override exists
      const overrides = await getOverridesForScenario(ctx.scenario.id);
      expect(overrides).toHaveLength(1);
    });
  });

  describe("deleteOverride", () => {
    it("removes override by id", async () => {
      const ctx = await createCompanyContext({
        user: { email: "delete-override@test.burnless.app" },
        company: { name: "Delete Override Co" },
      });

      const override = await createScenarioOverride(
        ctx.scenario.id,
        "forecast_line",
        "del-entity-1",
        "modify",
        { amount: 100 },
      );

      await deleteOverride(override.id);

      const overrides = await getOverridesForScenario(ctx.scenario.id);
      expect(overrides).toHaveLength(0);
    });
  });

  describe("deleteOverrideByEntity", () => {
    it("removes override by scenario+type+entity", async () => {
      const ctx = await createCompanyContext({
        user: { email: "delete-by-entity@test.burnless.app" },
        company: { name: "Delete By Entity Co" },
      });

      await createScenarioOverride(
        ctx.scenario.id,
        "forecast_line",
        "dbe-entity-1",
        "modify",
        { amount: 100 },
      );
      await createScenarioOverride(
        ctx.scenario.id,
        "revenue_stream",
        "dbe-entity-2",
        "create",
        { name: "Keep this" },
      );

      await deleteOverrideByEntity(
        ctx.scenario.id,
        "forecast_line",
        "dbe-entity-1",
      );

      const overrides = await getOverridesForScenario(ctx.scenario.id);
      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.entityType).toBe("revenue_stream");
    });
  });

  describe("getOverrideCount", () => {
    it("returns count of overrides for a scenario", async () => {
      const ctx = await createCompanyContext({
        user: { email: "count-overrides@test.burnless.app" },
        company: { name: "Count Overrides Co" },
      });

      expect(await getOverrideCount(ctx.scenario.id)).toBe(0);

      await createScenarioOverride(
        ctx.scenario.id,
        "forecast_line",
        "count-entity-1",
        "modify",
      );
      await createScenarioOverride(
        ctx.scenario.id,
        "revenue_stream",
        "count-entity-2",
        "create",
      );

      expect(await getOverrideCount(ctx.scenario.id)).toBe(2);
    });
  });

  describe("company isolation", () => {
    it("overrides from other company's scenarios are not returned", async () => {
      const ctx1 = await createCompanyContext({
        user: { email: "iso-company1@test.burnless.app" },
        company: { name: "Isolated Co 1" },
      });
      const ctx2 = await createCompanyContext({
        user: { email: "iso-company2@test.burnless.app" },
        company: { name: "Isolated Co 2" },
      });

      await createScenarioOverride(
        ctx1.scenario.id,
        "forecast_line",
        "iso-entity-1",
        "modify",
        { amount: 100 },
      );
      await createScenarioOverride(
        ctx2.scenario.id,
        "forecast_line",
        "iso-entity-2",
        "create",
        { amount: 200 },
      );

      const overrides1 = await getOverridesForScenario(ctx1.scenario.id);
      expect(overrides1).toHaveLength(1);
      expect(overrides1[0]!.entityId).toBe("iso-entity-1");

      const overrides2 = await getOverridesForScenario(ctx2.scenario.id);
      expect(overrides2).toHaveLength(1);
      expect(overrides2[0]!.entityId).toBe("iso-entity-2");

      // Verify counts are isolated too
      expect(await getOverrideCount(ctx1.scenario.id)).toBe(1);
      expect(await getOverrideCount(ctx2.scenario.id)).toBe(1);
    });
  });
});
