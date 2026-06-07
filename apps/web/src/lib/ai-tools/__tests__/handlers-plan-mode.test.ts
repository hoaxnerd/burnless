import { describe, it, expect, vi } from "vitest";

// analytics.ts and forecasting.ts import computeDashboardData and
// getDefaultScenario, which transitively pull in next/cache + next/headers
// (server-only Next.js APIs not available in vitest/happy-dom). Stub those
// modules so the module graph resolves; the stubs are never called by
// createAccount / createForecastLine.
vi.mock("../../compute-dashboard", () => ({ computeDashboardData: vi.fn() }));
vi.mock("../../data", () => ({ getDefaultScenario: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@burnless/engine", () => ({
  seriesToArray: vi.fn(() => []),
  monthKey: vi.fn(),
  previousMonthKey: vi.fn(),
}));

import "@db-test/setup";
import { createUser, createCompany, createScenario, createFinancialAccount, createDepartment, createHeadcountPlan, createScenarioOverride } from "@db-test/factories";
import { getOverridesForScenario } from "@burnless/db";
import { revenueHandlers } from "../revenue";
import { analyticsHandlers } from "../analytics";
import { forecastingHandlers } from "../forecasting";
import { headcountHandlers } from "../headcount";

async function seed() {
  const user = await createUser();
  const company = await createCompany(user.id);
  const scenario = await createScenario(company.id, { name: "Base", source: "blank", status: "active" });
  return { company, scenario, user };
}

describe("handlers honor plan mode (no write, delta returned)", () => {
  it("create_revenue_stream plan mode returns overrides + writes nothing", async () => {
    const { company, scenario, user } = await seed();
    const out = await revenueHandlers.create_revenue_stream!(
      { name: "Planned", type: "subscription", startDate: "2026-01-01", parameters: {} },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "plan" },
    );
    const parsed = JSON.parse(out);
    expect(parsed.planned).toBe(true);
    expect(parsed.overrides[0].action).toBe("create");
    const overrides = await getOverridesForScenario(scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(0);
  });

  it("create_revenue_stream commit mode writes the override as before", async () => {
    const { company, scenario, user } = await seed();
    const out = await revenueHandlers.create_revenue_stream!(
      { name: "Committed", type: "subscription", startDate: "2026-01-01", parameters: {} },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "commit" },
    );
    expect(JSON.parse(out).success).toBe(true);
    const overrides = await getOverridesForScenario(scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(1);
  });
});

describe("forecasting + analytics handlers honor plan mode", () => {
  it("create_account plan mode returns overrides + writes nothing", async () => {
    const { company, scenario, user } = await seed();
    const out = await analyticsHandlers.create_account!(
      { name: "Marketing Spend", type: "expense", category: "operating_expense" },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "plan" },
    );
    const parsed = JSON.parse(out);
    expect(parsed.planned).toBe(true);
    expect(parsed.overrides[0].action).toBe("create");
    const overrides = await getOverridesForScenario(scenario.id, "financial_account");
    expect(overrides).toHaveLength(0);
  });

  it("create_forecast_line plan mode returns overrides + writes nothing", async () => {
    const { company, scenario, user } = await seed();
    const account = await createFinancialAccount(company.id, {
      name: "R&D Expenses",
      type: "expense",
      category: "operating_expense",
    });
    const out = await forecastingHandlers.create_forecast_line!(
      {
        accountId: account.id,
        method: "fixed",
        parameters: { amount: 1000 },
        startDate: "2026-01-01",
      },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "plan" },
    );
    const parsed = JSON.parse(out);
    expect(parsed.planned).toBe(true);
    expect(parsed.overrides[0].action).toBe("create");
    const overrides = await getOverridesForScenario(scenario.id, "forecast_line");
    expect(overrides).toHaveLength(0);
  });
});

describe("funding + headcount plan mode", () => {
  it("create_headcount plan mode writes nothing", async () => {
    const { company, scenario, user } = await seed();
    const dept = await createDepartment(company.id, { name: "Eng" });
    const out = await headcountHandlers.create_headcount!(
      { title: "Engineer", departmentId: dept.id, salary: 150000, startDate: "2026-01-01", benefitsRate: 0.2 },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "plan" },
    );
    const parsed = JSON.parse(out);
    expect(parsed.planned).toBe(true);
    expect(parsed.overrides[0].action).toBe("create");
    const overrides = await getOverridesForScenario(scenario.id, "headcount_plan");
    expect(overrides).toHaveLength(0);
  });

  it("rejects a salary change for a headcount that is deleted in the scenario", async () => {
    const { company, scenario, user } = await seed();
    const dept = await createDepartment(company.id, { name: "Eng" });
    // Base headcount (exists in the base table)
    const hc = await createHeadcountPlan(company.id, dept.id);
    // Scenario DELETE override — hides the headcount in this scenario
    await createScenarioOverride(scenario.id, "headcount_plan", hc.id, "delete", undefined, { id: hc.id });

    const out = await headcountHandlers.create_salary_change!(
      { headcountId: hc.id, effectiveDate: "2026-06-01", newSalary: 120000 },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "plan" },
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(false); // ownership check must reject the scenario-deleted headcount
  });

  it("create_salary_change plan mode writes nothing", async () => {
    const { company, scenario, user } = await seed();
    const dept = await createDepartment(company.id, { name: "Eng" });
    const hc = await headcountHandlers.create_headcount!(
      { title: "Eng", departmentId: dept.id, salary: 100000, startDate: "2026-01-01", benefitsRate: 0.2 },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "commit" },
    );
    const hcId = JSON.parse(hc).headcountPlanId as string;
    const out = await headcountHandlers.create_salary_change!(
      { headcountId: hcId, effectiveDate: "2026-06-01", newSalary: 120000 },
      { companyId: company.id, userId: user.id, scenarioId: scenario.id, mode: "plan" },
    );
    expect(JSON.parse(out).planned).toBe(true);
    const overrides = await getOverridesForScenario(scenario.id, "salary_change");
    expect(overrides).toHaveLength(0);
  });
});
