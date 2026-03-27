import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  getScenarioForCompany,
  getDefaultScenario,
  getScenarioData,
  getScenarioDataWithValues,
} from "../queries/scenario";
import {
  createCompanyContext,
  createFinancialAccount,
  createForecastLine,
  createForecastValue,
  createRevenueStream,
  createHeadcountPlan,
  createDepartment,
  createFundingRound,
  createScenario,
} from "./factories";

describe("scenario queries", () => {
  let companyId: string;
  let scenarioId: string;
  let otherCompanyId: string;

  beforeAll(async () => {
    const ctx = await createCompanyContext({
      user: { email: "scenario-test@test.burnless.app" },
      company: { name: "Scenario Co" },
      scenario: { name: "Base Plan", isDefault: true },
    });
    companyId = ctx.company.id;
    scenarioId = ctx.scenario.id;

    // Create another company for isolation tests
    const ctx2 = await createCompanyContext({
      user: { email: "scenario-other@test.burnless.app" },
      company: { name: "Other Scenario Co" },
    });
    otherCompanyId = ctx2.company.id;
  });

  describe("getScenarioForCompany", () => {
    it("returns the scenario when it belongs to the company", async () => {
      const result = await getScenarioForCompany(scenarioId, companyId);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Base Plan");
      expect(result!.companyId).toBe(companyId);
    });

    it("returns null for wrong company", async () => {
      const result = await getScenarioForCompany(scenarioId, otherCompanyId);
      expect(result).toBeNull();
    });

    it("returns null for nonexistent scenario", async () => {
      const result = await getScenarioForCompany(
        "00000000-0000-0000-0000-000000000000",
        companyId,
      );
      expect(result).toBeNull();
    });
  });

  describe("getDefaultScenario", () => {
    it("returns the default scenario for the company", async () => {
      const result = await getDefaultScenario(companyId);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(scenarioId);
      expect(result!.isDefault).toBe(true);
    });

    it("returns null when no default scenario exists", async () => {
      // Create company with only non-default scenarios
      const ctx = await createCompanyContext({
        user: { email: "no-default@test.burnless.app" },
        company: { name: "No Default Co" },
        scenario: { isDefault: false, name: "Non-default" },
      });
      const result = await getDefaultScenario(ctx.company.id);
      expect(result).toBeNull();
    });
  });

  describe("getScenarioData", () => {
    it("returns all planning data for a scenario", async () => {
      const account = await createFinancialAccount(companyId, { name: "Office Rent" });
      const dept = await createDepartment(companyId, { name: "Engineering" });
      await createForecastLine(scenarioId, account.id);
      await createRevenueStream(scenarioId, { name: "SaaS Subscriptions" });
      await createHeadcountPlan(scenarioId, dept.id, { title: "Staff Engineer" });

      const data = await getScenarioData(scenarioId, companyId);

      expect(data.forecastLines.length).toBeGreaterThanOrEqual(1);
      expect(data.accounts.length).toBeGreaterThanOrEqual(1);
      expect(data.revenueStreams.length).toBeGreaterThanOrEqual(1);
      expect(data.headcountPlans.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty arrays for a scenario with no data", async () => {
      const emptyScenario = await createScenario(companyId, {
        name: "Empty Scenario",
        isDefault: false,
      });

      // Use a fresh company so accounts list is isolated
      const ctx = await createCompanyContext({
        user: { email: "empty-scenario@test.burnless.app" },
        company: { name: "Empty Data Co" },
        scenario: { name: "Empty", isDefault: false },
      });

      const data = await getScenarioData(ctx.scenario.id, ctx.company.id);
      expect(data.forecastLines).toEqual([]);
      expect(data.accounts).toEqual([]);
      expect(data.revenueStreams).toEqual([]);
      expect(data.headcountPlans).toEqual([]);
    });
  });

  describe("getScenarioDataWithValues", () => {
    it("includes forecast values and funding rounds", async () => {
      const ctx = await createCompanyContext({
        user: { email: "values-test@test.burnless.app" },
        company: { name: "Values Co" },
      });
      const account = await createFinancialAccount(ctx.company.id, { name: "Cloud Hosting" });
      const line = await createForecastLine(ctx.scenario.id, account.id);
      await createForecastValue(line.id, { amount: "5000.00", month: new Date("2026-03-01") });
      await createForecastValue(line.id, { amount: "5500.00", month: new Date("2026-04-01") });
      await createFundingRound(ctx.company.id, { name: "Seed Round", amount: "2000000.00" });

      const data = await getScenarioDataWithValues(ctx.scenario.id, ctx.company.id);

      expect(data.forecastValues).toHaveLength(2);
      expect(data.fundingRounds).toHaveLength(1);
      expect(data.fundingRounds[0]!.name).toBe("Seed Round");
      expect(data.forecastLines.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty forecast values when no forecast lines exist", async () => {
      const ctx = await createCompanyContext({
        user: { email: "no-lines@test.burnless.app" },
        company: { name: "No Lines Co" },
      });
      const data = await getScenarioDataWithValues(ctx.scenario.id, ctx.company.id);
      expect(data.forecastValues).toEqual([]);
      expect(data.forecastLines).toEqual([]);
    });
  });
});
