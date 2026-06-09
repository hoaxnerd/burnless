import { NextResponse } from "next/server";
import { db, forecastValues, getResolvedData } from "@burnless/db";
import { inArray } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { parseDateRange } from "@/lib/date-validation";
import { getActiveScenario } from "@/lib/scenario-middleware";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeAllHeadcountCosts,
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
  computeFundingImpact,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type AccountData,
  type MonthlySeries,
  addSeries,
  subtractSeries,
  monthKey,
  monthRange,
  D,
  dRound2,
  dSum,
} from "@burnless/engine";

/**
 * GET /api/statements?startDate=2026-01&endDate=2026-12
 *
 * Returns computed P&L, Cash Flow, and Balance Sheet.
 * Scenario ID comes from the X-Scenario-Id header via getActiveScenario.
 */
export const GET = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "heavy");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = getActiveScenario(request);
  const startDateStr = url.searchParams.get("startDate") ?? "2026-01";
  const endDateStr = url.searchParams.get("endDate") ?? "2026-12";

  const dateRange = parseDateRange(startDateStr, endDateStr);
  if ("error" in dateRange) return errorResponse(dateRange.error, 400);
  const { periodStart, periodEnd } = dateRange;

  // Resolve all entity types (base + scenario overrides)
  const data = await getResolvedData(ctx.companyId, scenarioId);

  // Fetch forecast values for all forecast lines
  const lineIds = data.forecastLines.map((l) => l.id);
  const allValues = lineIds.length > 0
    ? await db.select().from(forecastValues).where(
        inArray(forecastValues.forecastLineId, lineIds)
      )
    : [];

  // Group override values by forecast line ID
  const overridesByLine = new Map<string, Map<string, number>>();
  for (const fv of allValues) {
    if (!fv.isOverride) continue;
    let lineOverrides = overridesByLine.get(fv.forecastLineId);
    if (!lineOverrides) {
      lineOverrides = new Map();
      overridesByLine.set(fv.forecastLineId, lineOverrides);
    }
    lineOverrides.set(monthKey(fv.month), Number(fv.amount));
  }

  // Build forecast line inputs
  const forecastInputs: ForecastLineInput[] = data.forecastLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: fl.startDate,
    endDate: fl.endDate,
    overrides: overridesByLine.get(fl.id),
  }));

  // Compute forecast values
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Compute revenue from revenue streams
  const revInputs: RevenueStreamInput[] = data.revenueStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
    startDate: rs.startDate,
    endDate: rs.endDate,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  // Compute headcount costs
  const hcInputs: HeadcountPlanInput[] = data.headcountPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    name: hp.name ?? null,
    employeeType: hp.employeeType,
    count: Number(hp.count),
    salary: Number(hp.salary),
    hourlyRate: hp.hourlyRate == null ? null : Number(hp.hourlyRate),
    hoursPerWeek: hp.hoursPerWeek == null ? null : Number(hp.hoursPerWeek),
    startDate: hp.startDate,
    endDate: hp.endDate,
    benefitsRate: Number(hp.benefitsRate),
    benefitsBreakdown: (hp.parameters as { benefitsBreakdown?: HeadcountPlanInput["benefitsBreakdown"] } | null)?.benefitsBreakdown,
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Build account data for statement generation
  const accounts = data.financialAccounts;
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const accountDataList: AccountData[] = [];

  // Add forecast-based accounts
  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    accountDataList.push({
      id: account.id,
      name: account.name,
      category: account.category,
      values,
    });
  }

  // Add revenue from streams (merge into any existing revenue account or create synthetic)
  const revenueAccount = accounts.find((a) => a.category === "revenue" && a.isSystem);
  if (revenueValues.size > 0) {
    const existingRevIdx = accountDataList.findIndex((a) => a.category === "revenue");
    if (existingRevIdx >= 0) {
      accountDataList[existingRevIdx]!.values = addSeries(
        accountDataList[existingRevIdx]!.values,
        revenueValues
      );
    } else {
      accountDataList.push({
        id: revenueAccount?.id ?? "revenue-synthetic",
        name: "Revenue",
        category: "revenue",
        values: revenueValues,
      });
    }
  }

  // Add headcount costs as operating expense
  if (headcountCosts.totalCost.size > 0) {
    accountDataList.push({
      id: "headcount-cost",
      name: "Personnel Costs",
      category: "operating_expense",
      values: headcountCosts.totalCost,
    });
  }

  // Phase 4 E §J: route through computeFundingImpact. Mirrors the construction in compute-dashboard.ts.
  const funding = data.fundingRounds;
  const horizonMonths = monthRange(periodStart, periodEnd).map((d) => monthKey(d));
  const fundingImpact = computeFundingImpact({
    rounds: funding.map((r) => ({
      id: r.id,
      name: r.name,
      roundType: r.type as any, // DB enum matches FundingRoundType verbatim
      amount: Number(r.amount),
      date: (typeof r.date === "string" ? new Date(r.date) : r.date)
        .toISOString()
        .slice(0, 10),
      closeDate: r.closeDate
        ? (typeof r.closeDate === "string" ? new Date(r.closeDate) : r.closeDate)
            .toISOString()
            .slice(0, 10)
        : null,
      parameters: (r.parameters ?? {}) as any,
    })),
    months: horizonMonths,
    cumulativeQualifyingSpend: {},
  });

  // Phase 1 FAIL-1 (B1) §1.1 — lockstep with compute-financials.ts.
  // Push the debt interest as an `other_expense` AccountData row and grant
  // disbursements as `other_income` so generateProfitAndLoss's Net Income line
  // (and generateCashFlow's operating cash flow) include interest + grants. The
  // displayed Net Income then == the netIncome series we derive from it below.
  if (Array.from(fundingImpact.interestExpense.values()).some((v) => Math.abs(v) >= 0.005)) {
    accountDataList.push({
      id: "fi-interest-expense",
      name: "Interest Expense",
      category: "other_expense",
      values: fundingImpact.interestExpense,
    });
  }
  // M1: grant disbursements are other income (NOT paid-in capital).
  if (Array.from(fundingImpact.grantDisbursements.values()).some((v) => Math.abs(v) >= 0.005)) {
    accountDataList.push({
      id: "fi-grant-income",
      name: "Grant Income",
      category: "other_income",
      values: fundingImpact.grantDisbursements,
    });
  }

  // Phase 1 FAIL-1 (B1) §3c/§5 — real startingCash: pre-period equity/grant cash
  // only. EXCLUDE pre-period debt (a debt draw raises cash AND the debt liability
  // together via fundingImpact, so counting it in startingCash double-counts cash
  // and dangles the balance sheet).
  const startingCash = dSum(
    funding
      .filter(
        (r) =>
          !r.isProjected &&
          new Date(r.date) < periodStart &&
          r.type !== "debt",
      )
      .map((r) => Number(r.amount)),
  );

  // Generate statements. P&L first so we can derive the interest-inclusive
  // netIncome series the balance-sheet rows below build on (mirrors 1.1).
  const pnl = generateProfitAndLoss(accountDataList, {
    personnelBreakdown: { benefitsByComponent: headcountCosts.benefitsByComponent },
  });

  // netIncome series from the displayed P&L (interest-inclusive via the row above).
  const netIncome: MonthlySeries = new Map(
    pnl.netIncome.values.map((v) => [v.month, v.value]),
  );

  // Phase 1 FAIL-1 (B1) §1.1 cash loop: cash = startingCash + Σ(netIncome ≤ m)
  // + Σ(equity+debt+grant draws ≤ m) − Σ(principal ≤ m). Interest is already
  // inside netIncome (counted once) — funding cash flow nets inflows − principal
  // ONLY (subtracting interest again is the double-count trap).
  // Grants are other income (in netIncome), reaching cash once — NOT also a
  // financing inflow (else cash double-counts the grant). Equity + debt draws only.
  const fundingInflows = addSeries(fundingImpact.equityInflows, fundingImpact.debtInflows);
  const fundingCashFlow = subtractSeries(fundingInflows, fundingImpact.principalPayments);
  const cashPosition: MonthlySeries = new Map();
  let runningCash = D(startingCash);
  const months = Array.from(netIncome.keys()).sort();
  for (const m of months) {
    runningCash = runningCash.plus(netIncome.get(m) ?? 0).plus(fundingCashFlow.get(m) ?? 0);
    cashPosition.set(m, dRound2(runningCash));
  }

  // Phase 1 FAIL-1 (B1) §3d — derived balance-sheet rows so A = L + E foots.
  if (months.length > 0) {
    accountDataList.push({ id: "bs-cash", name: "Cash & Equivalents", category: "asset", values: cashPosition });

    // Retained earnings = Σ(netIncome) (interest-inclusive).
    const retainedEarnings: MonthlySeries = new Map();
    let cumNI = 0;
    for (const m of months) {
      cumNI = D(cumNI).plus(netIncome.get(m) ?? 0).toNumber();
      retainedEarnings.set(m, dRound2(D(cumNI)));
    }
    accountDataList.push({ id: "bs-retained-earnings", name: "Retained Earnings", category: "equity", values: retainedEarnings });

    // Paid-in Capital = startingCash + Σ(equity inflows) ONLY. Debt → liability
    // (below); grants → retained via netIncome (M1).
    const paidInCapital: MonthlySeries = new Map();
    let cumEquity = startingCash;
    for (const m of months) {
      cumEquity = D(cumEquity).plus(fundingImpact.equityInflows.get(m) ?? 0).toNumber();
      paidInCapital.set(m, dRound2(D(cumEquity)));
    }
    accountDataList.push({ id: "bs-paid-in-capital", name: "Paid-in Capital", category: "equity", values: paidInCapital });

    // Debt Outstanding (liability) = Σdraws − Σprincipal.
    const debtDrawCum: MonthlySeries = new Map();
    const principalCum: MonthlySeries = new Map();
    let cumDraw = 0;
    let cumPrincipal = 0;
    for (const m of months) {
      cumDraw = D(cumDraw).plus(fundingImpact.debtInflows.get(m) ?? 0).toNumber();
      cumPrincipal = D(cumPrincipal).plus(fundingImpact.principalPayments.get(m) ?? 0).toNumber();
      debtDrawCum.set(m, dRound2(D(cumDraw)));
      principalCum.set(m, dRound2(D(cumPrincipal)));
    }
    const debtOutstanding = subtractSeries(debtDrawCum, principalCum);
    if (Array.from(debtOutstanding.values()).some((v) => Math.abs(v) >= 0.005)) {
      accountDataList.push({ id: "bs-debt-outstanding", name: "Debt Outstanding", category: "liability", values: debtOutstanding });
    }
  }

  const cashFlow = generateCashFlow(
    accountDataList,
    startingCash,
    /* workingCapital */ undefined,
    fundingImpact,
  );
  const balanceSheet = generateBalanceSheet(accountDataList);

  return NextResponse.json({
    scenarioId: scenarioId ?? null,
    period: { start: startDateStr, end: endDateStr },
    profitAndLoss: pnl,
    cashFlow,
    balanceSheet,
    headcount: {
      totalCost: Array.from(headcountCosts.totalCost.entries()).sort(([a], [b]) => a.localeCompare(b)),
      totalHeadcount: Array.from(headcountCosts.headcount.entries()).sort(([a], [b]) => a.localeCompare(b)),
    },
  });
});
