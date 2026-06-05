import { describe, it, expect, vi } from "vitest";

// Phase B integration test: computeDashboardData carries transaction-only accounts
// (no forecast line) forward across the horizon so categories aren't thin past the
// last imported month — EXCEPT coversHeadcount accounts, whose forecast months are
// driven by the headcount plan (carrying them forward would double-count).

vi.mock("@burnless/db", async () => {
  const actual = await vi.importActual<typeof import("@burnless/db")>("@burnless/db");
  return { ...actual, db: { select: vi.fn() } as any };
});

const REVENUE_ACCOUNT = {
  id: "acc-rev", name: "Revenue", category: "revenue",
  isSystem: true, companyId: "company-1", coversHeadcount: false,
};
// Actual-only opex account — no forecast line. Should carry forward.
const INSURANCE_ACCOUNT = {
  id: "acc-ins", name: "Insurance", category: "operating_expense",
  isSystem: false, companyId: "company-1", coversHeadcount: false,
};
// Actual-only opex account flagged coversHeadcount — should NOT carry forward.
const SALARIES_ACCOUNT = {
  id: "acc-sal", name: "Salaries & Wages", category: "operating_expense",
  isSystem: false, companyId: "company-1", coversHeadcount: true,
};

// Actuals stop at 2026-03 for both accounts; horizon (year 2026) runs to December.
const txn = (accountId: string, month: string, amount: number) => ({
  id: `${accountId}-${month}`, accountId, date: new Date(`${month}-15`), amount,
});

vi.mock("../data", () => ({
  getAccounts: vi.fn(async () => [REVENUE_ACCOUNT, INSURANCE_ACCOUNT, SALARIES_ACCOUNT]),
  getForecastLines: vi.fn(async () => []),
  getForecastValues: vi.fn(async () => []),
  getRevenueStreams: vi.fn(async () => []),
  getHeadcountPlans: vi.fn(async () => []),
  getFundingRounds: vi.fn(async () => []),
  getTransactions: vi.fn(async () => [
    txn("acc-ins", "2026-01", 1000), txn("acc-ins", "2026-02", 2000), txn("acc-ins", "2026-03", 3000),
    txn("acc-sal", "2026-01", 5000), txn("acc-sal", "2026-02", 5000), txn("acc-sal", "2026-03", 5000),
  ]),
}));

describe("computeDashboardData Phase B carry-forward", () => {
  it("carries actual-only accounts forward but excludes coversHeadcount accounts", async () => {
    const { computeDashboardData } = await import("../compute-dashboard");
    const data = await computeDashboardData("company-1", "scenario-1", 2026);

    // March (last actual): both accounts contribute their real values → 3000 + 5000.
    expect(data.totalOpex.get("2026-03")).toBe(8000);

    // June (3 months past the last actual): Insurance carries the trailing-3 average
    // (1000+2000+3000)/3 = 2000; Salaries (coversHeadcount) is NOT carried → 2000 total.
    expect(data.totalOpex.get("2026-06")).toBe(2000);

    // December (end of horizon) still carries the actual-only account forward.
    expect(data.totalOpex.get("2026-12")).toBe(2000);
  });
});
