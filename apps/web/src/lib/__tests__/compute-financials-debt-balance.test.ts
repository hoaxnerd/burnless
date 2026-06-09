/**
 * Phase 1 Task 1.2 (FAIL-1 B2) — REAL-PIPELINE balance-sheet footing for a debt company.
 *
 * An engine fixture hand-built to foot is vacuous (it would green-light the B1
 * bug). This test exercises the REAL `computeFinancials` wiring through PGLite:
 * it seeds a debt company (and an equity-only control) with the real
 * `packages/db` factories, fetches the rows via the real `data.ts` read path,
 * and feeds them to `computeFinancials`.
 *
 * For EVERY month it asserts the four B1 invariants:
 *   (a) balanceSheet foots: Σassets ≈ Σliabilities + Σequity (tol 0.01).
 *   (b) netIncome carries interest: a debt month's netIncome is strictly less
 *       than the same scenario with no debt interest (equity control).
 *   (c) cashPosition drains by interest + principal vs the equity-only control.
 *   (d) statement consistency: profitAndLoss.netIncome[m] == netIncome series[m]
 *       == cash-flow net income (operatingCashFlow, no working-capital config).
 *
 * Pre-fix expectation (RED):
 *   - (b) FAILS — interest is routed only to metricsInput.interestExpense today,
 *     never into the netIncome series, so debt NI == control NI.
 *   - (c) FAILS — the old cash loop adds the unsigned debt draw and never
 *     subtracts interest/principal, so debt cash == control cash.
 *   - (d) FAILS post-fix-divergently only if the interest row leaks; pre-fix the
 *     P&L and the series agree only because BOTH omit interest — which (b)/(c)
 *     already prove is wrong.
 *
 * Do NOT fix the bug in this file.
 *
 * Uses real PGLite-backed DB (no mocks for DB semantics).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// PGLite hijack (assigns globalThis.__burnless_db) — must be first.
import "@db-test/setup";

import {
  createUser,
  createCompany,
  createFinancialAccount,
  createForecastLine,
  createFundingRound,
} from "@db-test/factories";

// next/cache + react cache passthrough so the data.ts getters run straight
// against PGLite (mirrors scenario-read-path.test.ts).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import {
  getAccounts,
  getForecastLines,
  getForecastValues,
  getRevenueStreams,
  getHeadcountPlans,
  getFundingRounds,
  getTransactions,
} from "../data";
import { computeFinancials } from "../compute-financials";

const PERIOD_START = new Date(2026, 0, 1);
const PERIOD_END = new Date(2026, 11, 1);

/** Seed a company with $10k/mo opex + $1/mo revenue + one funding round. */
async function seedCompany(roundType: "debt" | "seed") {
  const user = await createUser();
  const company = await createCompany(user.id);

  const revAcc = await createFinancialAccount(company.id, {
    name: "Revenue",
    type: "income",
    category: "revenue",
    isSystem: true,
  });
  const opexAcc = await createFinancialAccount(company.id, {
    name: "General OpEx",
    type: "expense",
    category: "operating_expense",
  });

  await createForecastLine(company.id, opexAcc.id, {
    method: "fixed",
    parameters: { amount: 10000 },
    startDate: new Date("2026-01-01"),
  });
  await createForecastLine(company.id, revAcc.id, {
    method: "fixed",
    parameters: { amount: 1 },
    startDate: new Date("2026-01-01"),
  });

  await createFundingRound(company.id, {
    name: roundType === "debt" ? "Bridge" : "Seed",
    type: roundType,
    amount: "120000.00",
    date: new Date("2026-01-01"),
    isProjected: false,
    parameters:
      roundType === "debt"
        ? { interestRate: 0.12, termMonths: 12, repaymentSchedule: "straight_line" }
        : {},
  });

  return company;
}

/** Run the REAL read path (data.ts getters) → computeFinancials. */
async function computeForCompany(companyId: string) {
  const [accounts, fLines, revStreams, hcPlans, funding, txns] = await Promise.all([
    getAccounts(companyId),
    getForecastLines(companyId, null),
    getRevenueStreams(companyId, null),
    getHeadcountPlans(companyId, null),
    getFundingRounds(companyId, null),
    getTransactions(companyId),
  ]);
  const forecastValues = await getForecastValues(fLines.map((l) => l.id));
  return computeFinancials({
    accounts,
    forecastLines: fLines,
    forecastValues,
    revenueStreams: revStreams,
    headcountPlans: hcPlans,
    fundingRounds: funding,
    transactions: txns,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });
}

const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

const arrAt = (rows: { month: string; value: number }[], m: string) =>
  rows.find((r) => r.month === m)?.value ?? 0;

describe("Phase 1 Task 1.2 — real-pipeline debt balance sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("foots every month, carries interest in netIncome, drains cash by interest+principal", async () => {
    const debtCompany = await seedCompany("debt");
    const equityCompany = await seedCompany("seed");

    const debt = await computeForCompany(debtCompany.id);
    const control = await computeForCompany(equityCompany.id);

    // (a) Balance sheet foots EVERY month: Σassets ≈ Σliabilities + Σequity.
    for (const m of MONTHS) {
      const a = arrAt(debt.balanceSheet.assets.values, m);
      const l = arrAt(debt.balanceSheet.liabilities.values, m);
      const e = arrAt(debt.balanceSheet.equity.values, m);
      expect(Math.abs(a - (l + e))).toBeLessThan(0.01);
    }

    // (b) netIncome carries interest: every debt month's NI is strictly below the
    // equity control's NI (same opex/revenue; only the debt adds interest expense).
    for (const m of MONTHS) {
      const niDebt = debt.netIncome.get(m) ?? 0;
      const niControl = control.netIncome.get(m) ?? 0;
      expect(niDebt).toBeLessThan(niControl);
    }

    // (c) cashPosition drains by interest + principal vs the equity-only control.
    // Both raise cash by the $120k draw; only the debt company repays principal and
    // pays interest, so debt cash must be strictly below control cash from month 1.
    for (const m of MONTHS) {
      const cashDebt = debt.cashPosition.get(m) ?? 0;
      const cashControl = control.cashPosition.get(m) ?? 0;
      expect(cashDebt).toBeLessThan(cashControl);
    }

    // (d) statement consistency: P&L netIncome == netIncome series == cash-flow
    // net income (operatingCashFlow with no working-capital config) for every month.
    for (const m of MONTHS) {
      const pnlNI = arrAt(debt.profitAndLoss.netIncome.values, m);
      const seriesNI = debt.netIncome.get(m) ?? 0;
      const cfNI = arrAt(debt.cashFlow.operatingCashFlow.values, m);
      expect(pnlNI).toBeCloseTo(seriesNI, 2);
      expect(cfNI).toBeCloseTo(seriesNI, 2);
    }
  });
});
