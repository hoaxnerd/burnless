import { describe, it, expect, vi } from "vitest";

// Smoke test: verify computeDashboardData wires fundingImpact through to metrics + cash flow.
// Uses a minimal mock of the DB layer. The key assertions are:
//   1. cashFlow.financingCashFlow.children contains the three structured financing lines
//      (proves fundingImpact was passed to generateCashFlow — legacy path omits children).
//   2. When there is data (non-empty months), netBurnRate for January reflects the debt
//      interest ($1,200) on top of operating expenses ($10,000) → $11,200.

vi.mock("@burnless/db", async () => {
  const actual = await vi.importActual<typeof import("@burnless/db")>("@burnless/db");
  return {
    ...actual,
    db: { select: vi.fn() } as any,
  };
});

// One revenue account and one opex account so that both revenue and expense months are
// populated — metrics.netBurnRate iterates over revenue.keys().
const REVENUE_ACCOUNT = {
  id: "acc-rev",
  name: "Revenue",
  category: "revenue",
  isSystem: true,
  companyId: "company-1",
};
const OPEX_ACCOUNT = {
  id: "acc-opex",
  name: "General OpEx",
  category: "operating_expense",
  isSystem: false,
  companyId: "company-1",
};

// $10,000/mo fixed expense; $1 token revenue so months are seeded in metrics.
const OPEX_LINE = {
  id: "fl-opex",
  accountId: "acc-opex",
  method: "fixed" as const,
  parameters: { amount: 10000 },
  startDate: new Date("2026-01-01"),
  endDate: null,
  isOneTime: false,
};
const REV_LINE = {
  id: "fl-rev",
  accountId: "acc-rev",
  method: "fixed" as const,
  parameters: { amount: 1 }, // $1 so months are non-empty without distorting burn much
  startDate: new Date("2026-01-01"),
  endDate: null,
  isOneTime: false,
};

vi.mock("../data", () => ({
  getAccounts: vi.fn(async () => [REVENUE_ACCOUNT, OPEX_ACCOUNT]),
  getForecastLines: vi.fn(async () => [OPEX_LINE, REV_LINE]),
  getForecastValues: vi.fn(async () => []),
  getRevenueStreams: vi.fn(async () => []),
  getHeadcountPlans: vi.fn(async () => []),
  getFundingRounds: vi.fn(async () => [
    {
      id: "d1",
      name: "Bridge",
      type: "debt",
      amount: "120000",
      date: new Date("2026-01-01"),
      closeDate: null,
      preMoneyValuation: null,
      dilutionPercent: null,
      isProjected: false,
      parameters: { interestRate: 0.12, termMonths: 12, repaymentSchedule: "straight_line" },
    },
  ]),
  getTransactions: vi.fn(async () => []),
}));

describe("computeDashboardData funding wiring", () => {
  it("plumbs interestExpense/principalPayments into metrics + cash flow", async () => {
    const { computeDashboardData } = await import("../compute-dashboard");
    const data = await computeDashboardData("company-1", "scenario-1", 2026);

    // Assertion 1: The cash flow has the new financing children (proves fundingImpact
    // was passed to generateCashFlow — the legacy path omits children entirely).
    expect(data.cashFlow.financingCashFlow.children?.map((c) => c.name)).toEqual([
      "Equity Inflows", "Debt Inflows", "Principal Payments",
    ]);

    // Assertion 2: Net burn for January should include the $1,200 debt interest on top
    // of the $10,000 operating expense, minus $1 revenue → netBurnRate = $11,199.
    // (netBurnRate = max(0, opex + interest - revenue) = max(0, 10000 + 1200 - 1) = 11199)
    const janBurn = data.metrics.netBurnRate.find((m) => m.month === "2026-01")?.value;
    expect(janBurn).toBe(11_199);

    // Assertion 3 (Task 1.1 — FAIL-1): cumulative cashPosition must drain by debt
    // interest + principal. Derived by running computeFundingImpact for THIS fixture
    // ($120k debt, 1%/mo on declining balance, straight-line $10k/mo principal):
    //   netIncome[m] = rev($1) − opex($10,000) − interest[m]   (interest now inside NI)
    //   cash[m] = startingCash(0) + Σdraws + Σnetincome − Σprincipal
    // Jan: 0 + 120000 + (1−10000−1200) − 10000          = 98,801
    // Feb: 98801 + (1−10000−1100) − 10000               = 77,702
    // Interest is counted ONCE (via netIncome); principal once; the $120k draw raises
    // cash once. Old code added the unsigned draw and never subtracted interest/principal.
    expect(data.cashPosition.get("2026-01")).toBe(98_801);
    expect(data.cashPosition.get("2026-02")).toBe(77_702);
    expect(data.cashPosition.get("2026-12")).toBe(-127_788);

    // grossBurnRate (burn contract, Phase 2D §D6) = opex + interest, UNCHANGED by this
    // fix — interest must NOT be double-counted in burn. Jan = 10000 + 1200 = 11,200.
    const janGross = data.metrics.burnRate.find((m) => m.month === "2026-01")?.value;
    expect(janGross).toBe(11_200);
  });
});
