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
import { createUser, createCompany, createScenario, createFinancialAccount } from "@db-test/factories";
import { getOverridesForScenario } from "@burnless/db";
import { revenueHandlers } from "../revenue";
import { analyticsHandlers } from "../analytics";
import { forecastingHandlers } from "../forecasting";

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
