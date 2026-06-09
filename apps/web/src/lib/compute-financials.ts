/**
 * Shared financial compute core — the SINGLE source of truth for turning
 * scenario-resolved entities + transaction actuals into financial series,
 * statements, and metrics.
 *
 * Pure (no I/O): callers fetch the data (dashboard via the cached `data.ts`
 * helpers; API routes via `getResolvedData` + transactions) and pass it in.
 * This guarantees `computeDashboardData`, `GET /api/metrics`, and
 * `GET /api/scenarios/compare` produce IDENTICAL numbers — no route may
 * re-implement the blend (actuals + Phase B carry-forward + coversHeadcount
 * reconciliation + funding impact) and drift from the dashboard.
 *
 * Period-parameterized: callers pass `periodStart`/`periodEnd` directly, so the
 * API routes keep their arbitrary-date-range contract while the dashboard passes
 * a calendar year.
 */
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeRevenueStream,
  computeTotalRevenue,
  computeSubscriptionDetailForStream,
  computeAllHeadcountCosts,
  reconcileHeadcountWithActuals,
  computeAllMetrics,
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
  computeFundingImpact,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type MetricsInput,
  type AccountData,
  type MonthlySeries,
  type ComputedMetrics,
  type ProfitAndLoss,
  type CashFlowStatement,
  type BalanceSheet,
  type WorkingCapitalAdjustments,
  addSeries,
  subtractSeries,
  monthKey,
  monthRange,
  projectActualsForward,
  D,
  dRound2,
  dSum,
} from "@burnless/engine";

export interface RevenueByType {
  subscriptionRevenue: MonthlySeries;
  oneTimeRevenue: MonthlySeries;
  usageRevenue: MonthlySeries;
  servicesRevenue: MonthlySeries;
  marketplaceRevenue: MonthlySeries;
  ecommerceRevenue: MonthlySeries;
  hardwareRevenue: MonthlySeries;
}

/**
 * Loosely-typed entity inputs — structural so both the `data.ts` cached-query
 * return rows and `getResolvedData`'s resolved rows satisfy them. Enum-ish
 * fields are cast at the engine-mapping boundary below.
 */
export interface FinancialsInput {
  accounts: Array<{ id: string; name: string; category: string; isSystem?: boolean | null; coversHeadcount?: boolean | null }>;
  forecastLines: Array<{ id: string; accountId: string; name?: string | null; method: string; parameters?: unknown; startDate: Date | string; endDate?: Date | string | null; isOneTime?: boolean | null }>;
  forecastValues: Array<{ forecastLineId: string; month: Date | string; amount: unknown; isOverride?: boolean | null }>;
  revenueStreams: Array<{ id: string; name: string; type: string; parameters?: unknown; startDate: Date | string; endDate?: Date | string | null }>;
  headcountPlans: Array<{
    id: string; departmentId: string; title: string; name?: string | null; employeeType: string;
    count: number | string; salary: number | string; hourlyRate?: number | string | null;
    hoursPerWeek?: number | string | null; startDate: Date | string; endDate?: Date | string | null;
    benefitsRate: number | string; parameters?: unknown;
  }>;
  fundingRounds: Array<{ id: string; name: string; type: string; amount: number | string; date: Date | string; closeDate?: Date | string | null; parameters?: unknown; isProjected?: boolean | null }>;
  transactions: Array<{ accountId: string; date: Date | string; amount: unknown }>;
  periodStart: Date;
  periodEnd: Date;
}

/** A blended per-line series for breakdown grouping (actuals + carry-forward + reconcile). */
export interface BlendedExpenseLine {
  accountId: string;
  accountName: string;
  category: "operating_expense" | "cogs" | "other_expense";
  values: MonthlySeries;
}
export interface BlendedRevenueLine {
  streamId: string;
  name: string;
  type: string;
  values: MonthlySeries;
}

export interface FinancialsResult {
  metrics: ComputedMetrics;
  profitAndLoss: ProfitAndLoss;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  totalRevenue: MonthlySeries;
  revenueByType: RevenueByType;
  totalExpenses: MonthlySeries;
  totalCogs: MonthlySeries;
  totalOpex: MonthlySeries;
  netIncome: MonthlySeries;
  cashPosition: MonthlySeries;
  headcountSeries: MonthlySeries;
  headcountCostSeries: MonthlySeries;
  headcountCostByDepartment: Map<string, MonthlySeries>;
  headcountByDepartment: Map<string, MonthlySeries>;
  startingCash: number;
  hasData: boolean;
  periodStart: Date;
  periodEnd: Date;
  expenseLines: BlendedExpenseLine[];
  revenueLines: BlendedRevenueLine[];
  /** totalRevenue − Σ(revenueLines): revenue (transaction actuals or forecast-account lines) not attributable to a named stream. */
  revenueResidual: MonthlySeries;
}

export function computeFinancials(input: FinancialsInput): FinancialsResult {
  const {
    accounts, forecastLines: fLines, forecastValues: allValues, revenueStreams: revStreams,
    headcountPlans: hcPlans, fundingRounds: funding, transactions: txns, periodStart, periodEnd,
  } = input;

  // Phase 2 D §1.3: structured funding impact for burn/runway semantics + cash-flow children.
  const horizonMonths = monthRange(periodStart, periodEnd).map((d) => monthKey(d));
  const fundingImpact = computeFundingImpact({
    rounds: funding.map((r) => ({
      id: r.id,
      name: r.name,
      roundType: r.type as any, // DB enum matches FundingRoundType verbatim
      amount: Number(r.amount),
      date: (typeof r.date === "string" ? new Date(r.date) : r.date).toISOString().slice(0, 10),
      closeDate: r.closeDate
        ? (typeof r.closeDate === "string" ? new Date(r.closeDate) : r.closeDate).toISOString().slice(0, 10)
        : null,
      parameters: (r.parameters ?? {}) as any,
    })),
    months: horizonMonths,
    cumulativeQualifyingSpend: {},
  });

  // Forecast value overrides (caller supplies the rows; no I/O here).
  const overridesByLine = new Map<string, Map<string, number>>();
  for (const fv of allValues) {
    if (!fv.isOverride) continue;
    let lineOverrides = overridesByLine.get(fv.forecastLineId);
    if (!lineOverrides) {
      lineOverrides = new Map();
      overridesByLine.set(fv.forecastLineId, lineOverrides);
    }
    lineOverrides.set(monthKey(new Date(fv.month)), Number(fv.amount));
  }

  // Compute forecasts
  const forecastInputs: ForecastLineInput[] = fLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    name: fl.name ?? null, // Phase 4 §4.7: custom_formula refs other lines by name
    method: fl.method as ForecastLineInput["method"],
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: new Date(fl.startDate),
    endDate: fl.endDate ? new Date(fl.endDate) : null,
    overrides: overridesByLine.get(fl.id),
  }));
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Revenue from streams
  const revInputs: RevenueStreamInput[] = revStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type as RevenueStreamInput["type"],
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
    startDate: rs.startDate as RevenueStreamInput["startDate"],
    endDate: rs.endDate as RevenueStreamInput["endDate"],
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  // Per-type revenue mix (component metrics — keys match slugs in metric registry Task 6).
  const revenueByTypeRaw: Record<string, MonthlySeries> = {
    subscription: new Map(),
    one_time: new Map(),
    usage_based: new Map(),
    services: new Map(),
    marketplace: new Map(),
    ecommerce: new Map(),
    hardware: new Map(),
  };
  const revStreamSeries = new Map<string, MonthlySeries>();
  for (const stream of revInputs) {
    const series = computeRevenueStream(stream, periodStart, periodEnd);
    revStreamSeries.set(stream.id, series);
    const existing = revenueByTypeRaw[stream.type] ?? new Map<string, number>();
    revenueByTypeRaw[stream.type] = addSeries(existing, series);
  }
  const revenueByType: RevenueByType = {
    subscriptionRevenue: revenueByTypeRaw.subscription!,
    oneTimeRevenue: revenueByTypeRaw.one_time!,
    usageRevenue: revenueByTypeRaw.usage_based!,
    servicesRevenue: revenueByTypeRaw.services!,
    marketplaceRevenue: revenueByTypeRaw.marketplace!,
    ecommerceRevenue: revenueByTypeRaw.ecommerce!,
    hardwareRevenue: revenueByTypeRaw.hardware!,
  };

  // Subscription details — gated to each stream's active window so a not-yet-started
  // or ended subscription doesn't leak phantom MRR (mirrors computeRevenueStream).
  const subDetails = revInputs
    .filter((rs) => rs.type === "subscription")
    .flatMap((rs) => computeSubscriptionDetailForStream(rs, periodStart, periodEnd));

  // Headcount
  const hcInputs: HeadcountPlanInput[] = hcPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    name: hp.name ?? null,
    employeeType: hp.employeeType as HeadcountPlanInput["employeeType"],
    count: Number(hp.count),
    salary: Number(hp.salary),
    hourlyRate: hp.hourlyRate == null ? null : Number(hp.hourlyRate),
    hoursPerWeek: hp.hoursPerWeek == null ? null : Number(hp.hoursPerWeek),
    startDate: new Date(hp.startDate),
    endDate: hp.endDate ? new Date(hp.endDate) : null,
    benefitsRate: Number(hp.benefitsRate),
    benefitsBreakdown: (hp.parameters as { benefitsBreakdown?: HeadcountPlanInput["benefitsBreakdown"] } | null)?.benefitsBreakdown,
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Aggregate actual transactions by account (for COGS and other imported data).
  // Filter by month membership in the horizon, not by raw date vs periodEnd — the
  // model is monthly, so a transaction belongs iff its month-key is in range. This
  // makes the result independent of periodEnd's exact day (e.g. Dec 1 vs Dec 31),
  // so the dashboard and the API routes never diverge on edge-of-month actuals.
  const horizonMonthSet = new Set(horizonMonths);
  const actualsByAccount = new Map<string, MonthlySeries>();
  for (const txn of txns) {
    const key = monthKey(txn.date);
    if (!horizonMonthSet.has(key)) continue;
    const existing = actualsByAccount.get(txn.accountId) ?? new Map();
    existing.set(key, (existing.get(key) ?? 0) + Number(txn.amount));
    actualsByAccount.set(txn.accountId, existing);
  }

  // Aggregate by category (forecasts + actuals)
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Phase 5 §#5: prevent salary double-count. When an account is flagged
  // `coversHeadcount`, its transaction actuals ARE personnel cost that the
  // headcount plan also models. Collect the months that have such actuals so we
  // can suppress the headcount-plan cost there (actuals win in closed months;
  // the plan still drives forecast months). No-op for headcount-plan-only
  // companies (the set is empty), so their personnel cost is unaffected.
  const personnelActualMonths = new Set<string>();
  for (const [accountId, actuals] of actualsByAccount) {
    if (!accountMap.get(accountId)?.coversHeadcount) continue;
    for (const [m, v] of actuals) if (v !== 0) personnelActualMonths.add(m);
  }
  const reconciledHeadcountCost = reconcileHeadcountWithActuals(
    headcountCosts.totalCost,
    personnelActualMonths,
  );
  let totalRevenue = new Map(revenueValues);
  let totalCogs: MonthlySeries = new Map();
  let totalOpex: MonthlySeries = new Map();
  let totalOtherIncome: MonthlySeries = new Map();
  let totalOtherExpense: MonthlySeries = new Map();

  const expenseLineMap = new Map<string, BlendedExpenseLine>();
  const isExpenseCat = (c: string) => c === "cogs" || c === "operating_expense" || c === "other_expense";

  const seenAccountIds = new Set<string>();
  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    seenAccountIds.add(accountId);
    if (account.category === "revenue") totalRevenue = addSeries(totalRevenue, values);
    else if (account.category === "cogs") totalCogs = addSeries(totalCogs, values);
    else if (account.category === "operating_expense") totalOpex = addSeries(totalOpex, values);
    else if (account.category === "other_income") totalOtherIncome = addSeries(totalOtherIncome, values);
    else if (account.category === "other_expense") totalOtherExpense = addSeries(totalOtherExpense, values);
    if (isExpenseCat(account.category)) {
      expenseLineMap.set(accountId, {
        accountId, accountName: account.name,
        category: account.category as BlendedExpenseLine["category"], values,
      });
    }
  }
  // Include accounts that only have transaction data (no forecast lines).
  // Phase B: carry each such account's actuals forward across the horizon so the
  // category doesn't read 0 after the last imported month (which would skew Gross
  // Margin to 100% and make expenses look thin). coversHeadcount accounts are
  // excluded — the headcount plan already projects those months, so carrying the
  // actuals forward would double-count against the reconciled plan cost.
  for (const [accountId, actuals] of actualsByAccount) {
    if (seenAccountIds.has(accountId)) continue;
    const account = accountMap.get(accountId);
    if (!account) continue;
    const series = account.coversHeadcount
      ? actuals
      : projectActualsForward(actuals, horizonMonths);
    if (account.category === "revenue") totalRevenue = addSeries(totalRevenue, series);
    else if (account.category === "cogs") totalCogs = addSeries(totalCogs, series);
    else if (account.category === "operating_expense") totalOpex = addSeries(totalOpex, series);
    else if (account.category === "other_income") totalOtherIncome = addSeries(totalOtherIncome, series);
    else if (account.category === "other_expense") totalOtherExpense = addSeries(totalOtherExpense, series);
    if (isExpenseCat(account.category)) {
      expenseLineMap.set(accountId, {
        accountId, accountName: account.name,
        category: account.category as BlendedExpenseLine["category"], values: series,
      });
    }
  }
  totalOpex = addSeries(totalOpex, reconciledHeadcountCost);
  if (reconciledHeadcountCost.size > 0) {
    expenseLineMap.set("headcount-cost", {
      accountId: "headcount-cost", accountName: "Personnel Costs",
      category: "operating_expense", values: reconciledHeadcountCost,
    });
  }
  // Phase 1 FAIL-1 (B1) §1.1: keep `totalExpenses` interest-free so the engine
  // burn contract (grossBurnRate = totalExpenses + interest, Phase 2D §D6) is
  // unchanged and interest is NOT double-counted in burn.
  const totalExpenses = addSeries(addSeries(totalCogs, totalOpex), totalOtherExpense);
  // Phase 1 FAIL-1 (B1) §1.1 + M1: interest enters netIncome (so retained earnings
  // absorbs it once, fixing both footing and the "Net Income is pre-interest"
  // concern); grant disbursements are other income (NOT paid-in capital, M1).
  const otherIncomeWithGrants = addSeries(totalOtherIncome, fundingImpact.grantDisbursements);
  const netIncome = subtractSeries(
    subtractSeries(addSeries(totalRevenue, otherIncomeWithGrants), totalExpenses),
    fundingImpact.interestExpense,
  );

  // Expense-mix component series (Phase 1 §1.5 MANDATE) — per-month sums of
  // forecast-line values bucketed by method / isOneTime. These feed the
  // dashboard slugs `fixedExpenses` / `variableExpenses` /
  // `percentageDrivenExpenses` / `oneTimeExpenses` via extractMetricValue.
  let fixedExpensesSeries: MonthlySeries = new Map();
  let variableExpensesSeries: MonthlySeries = new Map();
  let percentageDrivenExpensesSeries: MonthlySeries = new Map();
  let oneTimeExpensesSeries: MonthlySeries = new Map();
  for (const fLine of fLines) {
    const account = accountMap.get(fLine.accountId);
    if (!account) continue;
    if (account.category !== "operating_expense" && account.category !== "cogs") continue;
    const values = forecastResults.get(fLine.id);
    if (!values) continue;
    if (fLine.method === "fixed") {
      fixedExpensesSeries = addSeries(fixedExpensesSeries, values);
    } else if (fLine.method === "growth_rate" || fLine.method === "per_unit") {
      variableExpensesSeries = addSeries(variableExpensesSeries, values);
    } else if (fLine.method === "percentage_of" || fLine.method === "custom_formula") {
      percentageDrivenExpensesSeries = addSeries(percentageDrivenExpensesSeries, values);
    }
    if ((fLine as { isOneTime?: boolean }).isOneTime) {
      oneTimeExpensesSeries = addSeries(oneTimeExpensesSeries, values);
    }
  }

  // Cash position — Phase 1 FAIL-1 (B1) §1.1.
  // startingCash = pre-period equity/grant cash only. EXCLUDE pre-period debt
  // (§3c): debt is a financing inflow modeled month-by-month via fundingImpact
  // (draw raises cash AND the debt liability together), so counting a pre-period
  // debt round in startingCash would double-count the cash and dangle the BS.
  const startingCash = dSum(
    funding
      .filter((r) => !r.isProjected && new Date(r.date) < periodStart && r.type !== "debt")
      .map((r) => Number(r.amount)),
  );
  // Funding cash flow = (equity + debt + grant draws) − principal ONLY. Interest
  // is already inside netIncome (counted once) — subtracting it again here is the
  // double-count trap B1 fixes.
  // Grants are recognized as OTHER INCOME (otherIncomeWithGrants → netIncome →
  // retained earnings), so they reach cash via netIncome exactly once. They must
  // NOT also appear as a financing inflow here, or cash double-counts the grant
  // and the balance sheet is over by Σgrant (Phase 1 review catch). Equity + debt
  // draws only; principal repaid.
  const fundingInflows = addSeries(fundingImpact.equityInflows, fundingImpact.debtInflows);
  const fundingCashFlow = subtractSeries(fundingInflows, fundingImpact.principalPayments);
  const cashPosition: MonthlySeries = new Map();
  let runningCash = D(startingCash);
  for (const m of Array.from(netIncome.keys()).sort()) {
    runningCash = runningCash.plus(netIncome.get(m) ?? 0).plus(fundingCashFlow.get(m) ?? 0);
    cashPosition.set(m, dRound2(runningCash));
  }

  // NOTE (Phase 5 Task 5.5): metrics are computed BELOW the balance-sheet/cash-flow
  // build so workingCapital / freeCashFlow / interest read from the REAL statements.
  // cashPosition (built above, Phase 1) stays where it is and is consumed by the
  // bs-cash row; nothing that reads `metrics` may execute before that moved block.

  // Financial statements — forecasts for accounts with forecast lines, actuals for the rest
  const accountDataList: AccountData[] = [];
  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    accountDataList.push({ id: account.id, name: account.name, category: account.category as AccountData["category"], values });
  }

  // Add accounts that only have transaction data (no forecast lines)
  for (const [accountId, actuals] of actualsByAccount) {
    if (seenAccountIds.has(accountId)) continue;
    const account = accountMap.get(accountId);
    if (!account) continue;
    accountDataList.push({ id: account.id, name: account.name, category: account.category as AccountData["category"], values: actuals });
  }

  // Add revenue from streams
  const revenueAccount = accounts.find((a) => a.category === "revenue" && a.isSystem);
  if (revenueValues.size > 0) {
    const existingRevIdx = accountDataList.findIndex((a) => a.category === "revenue");
    if (existingRevIdx >= 0) {
      accountDataList[existingRevIdx]!.values = addSeries(accountDataList[existingRevIdx]!.values, revenueValues);
    } else {
      accountDataList.push({
        id: revenueAccount?.id ?? "revenue-synthetic",
        name: "Revenue",
        category: "revenue",
        values: revenueValues,
      });
    }
  }

  // Add headcount costs (reconciled so payroll actuals aren't double-counted in
  // the P&L — same series used for totalOpex above).
  if (reconciledHeadcountCost.size > 0) {
    accountDataList.push({
      id: "headcount-cost",
      name: "Personnel Costs",
      category: "operating_expense",
      values: reconciledHeadcountCost,
    });
  }

  // Phase 1 FAIL-1 (B1) §1.1 statement consistency: push the debt interest as an
  // `other_expense` AccountData row so generateProfitAndLoss's Net Income line and
  // generateCashFlow's operating cash flow include interest and AGREE with the
  // interest-inclusive `netIncome` series above. This row is added AFTER
  // metricsInput.totalExpenses was computed, so it does NOT leak into burn (which
  // keeps interest separate via metricsInput.interestExpense).
  if (Array.from(fundingImpact.interestExpense.values()).some((v) => Math.abs(v) >= 0.005)) {
    accountDataList.push({
      id: "fi-interest-expense",
      name: "Interest Expense",
      category: "other_expense",
      values: fundingImpact.interestExpense,
    });
  }
  // M1: grant disbursements are other income (NOT paid-in capital). Mirror the
  // `otherIncomeWithGrants` blend into accountDataList so the displayed P&L /
  // cash-flow net income agrees with the `netIncome` series.
  if (Array.from(fundingImpact.grantDisbursements.values()).some((v) => Math.abs(v) >= 0.005)) {
    accountDataList.push({
      id: "fi-grant-income",
      name: "Grant Income",
      category: "other_income",
      values: fundingImpact.grantDisbursements,
    });
  }

  const profitAndLoss = generateProfitAndLoss(accountDataList, {
    personnelBreakdown: { benefitsByComponent: headcountCosts.benefitsByComponent },
  });
  const cashFlow = generateCashFlow(
    accountDataList,
    startingCash,
    /* workingCapital */ undefined,
    fundingImpact,
  );

  // Add derived balance sheet accounts so generateBalanceSheet has data.
  const months = Array.from(netIncome.keys()).sort();
  // A/P balance per month — built below, routed via workingCapitalAdjustments.
  const accountsPayable: MonthlySeries = new Map();
  if (months.length > 0) {
    accountDataList.push({ id: "bs-cash", name: "Cash & Equivalents", category: "asset", values: cashPosition });

    const retainedEarnings: MonthlySeries = new Map();
    let cumNI = 0;
    for (const m of months) {
      cumNI += netIncome.get(m) ?? 0;
      retainedEarnings.set(m, dRound2(D(cumNI)));
    }
    accountDataList.push({ id: "bs-retained-earnings", name: "Retained Earnings", category: "equity", values: retainedEarnings });

    // Phase 1 FAIL-1 (B1) §3d: Paid-in Capital = startingCash + Σ(equity inflows)
    // ONLY. Debt is a liability (bs-debt-outstanding below), grants are other
    // income (→ retained via netIncome, M1). The old code added the full funding
    // amount (debt included) as equity, mislabeling debt and dangling the BS.
    const paidInCapital: MonthlySeries = new Map();
    let cumEquity = startingCash;
    for (const m of months) {
      cumEquity = D(cumEquity).plus(fundingImpact.equityInflows.get(m) ?? 0).toNumber();
      paidInCapital.set(m, dRound2(D(cumEquity)));
    }
    accountDataList.push({ id: "bs-paid-in-capital", name: "Paid-in Capital", category: "equity", values: paidInCapital });

    // Phase 1 FAIL-1 (B1) §3d: Debt Outstanding (liability) = Σdraws − Σprincipal.
    // The draw raised cash (asset) and the liability together; principal repaid
    // drains cash and the liability together → A = L + E holds every month.
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

    // Liability: Accounts Payable — approximate as 1 month of total expenses (Net-30 terms).
    for (const m of months) {
      accountsPayable.set(m, dRound2(D(totalExpenses.get(m) ?? 0)));
    }
    // RPT-01: route A/P through workingCapitalAdjustments (NOT a standalone
    // liability AccountData row). The engine adds A/P to BOTH current liabilities
    // AND current assets (cash held back because the bill is unpaid — the
    // double-entry counterpart), so Assets == Liabilities + Equity holds.
    // Injecting it only as a liability row would dangle the balance sheet.
  }

  const workingCapitalAdjustments: WorkingCapitalAdjustments = {
    arChange: new Map(),
    apChange: new Map(),
    depreciation: new Map(),
    accountsReceivable: new Map(),
    accountsPayable,
    capitalExpenditures: new Map(),
  };
  const balanceSheet = generateBalanceSheet(accountDataList, workingCapitalAdjustments);

  // ── Metrics (Phase 5 Task 5.5) ────────────────────────────────────────────
  // Computed AFTER the statements so freeCashFlow / workingCapital read the REAL
  // operating-cash-flow + current-asset/liability lines instead of falling back
  // (FCF→netIncome, WC→0). `lineToSeries` reverses a StatementLineItem's
  // `{month,value}[]` back into the MonthlySeries the metrics input expects.
  const lineToSeries = (li: { values: { month: string; value: number }[] }): MonthlySeries => {
    const s: MonthlySeries = new Map();
    for (const { month, value } of li.values) s.set(month, value);
    return s;
  };
  const metricsInput: MetricsInput = {
    revenue: totalRevenue,
    subscriptionDetails: subDetails,
    totalExpenses,
    cogs: totalCogs,
    operatingExpenses: totalOpex,
    cashPosition,
    netIncome,
    headcount: headcountCosts.headcount,
    interestExpense: fundingImpact.interestExpense,
    principalPayments: fundingImpact.principalPayments,
    operatingCashFlow: lineToSeries(cashFlow.operatingCashFlow),
    currentAssets: lineToSeries(balanceSheet.currentAssets),
    currentLiabilities: lineToSeries(balanceSheet.currentLiabilities),
  };
  const metrics = computeAllMetrics(metricsInput);

  // Surface non-ComputedMetrics series via slug so build-slot-metrics /
  // extractMetricValue can resolve them.
  const attach = (slug: string, series: MonthlySeries) => {
    (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug] =
      Array.from(series.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([month, value]) => ({ month, value }));
  };
  attach("totalOpex", totalOpex);
  attach("fixedExpenses", fixedExpensesSeries);
  attach("variableExpenses", variableExpensesSeries);
  attach("percentageDrivenExpenses", percentageDrivenExpensesSeries);
  attach("oneTimeExpenses", oneTimeExpensesSeries);

  const hasData = fLines.length > 0 || revStreams.length > 0 || hcPlans.length > 0;

  // Blended per-line series for breakdown grouping. expenseLines are built from
  // the SAME carry-forward-applied series that feed totalExpenses (forecast /
  // carried-forward actuals + reconciled headcount), so Σ(expenseLines) reconciles
  // to totalExpenses in projection months. revenueLines are per-stream, with
  // revenueResidual capturing imported revenue-account actuals not attributable
  // to any stream.
  const expenseLines: BlendedExpenseLine[] = Array.from(expenseLineMap.values());

  const revenueLines: BlendedRevenueLine[] = revInputs.map((s) => ({
    streamId: s.id,
    name: s.name,
    type: s.type,
    values: revStreamSeries.get(s.id) ?? new Map(),
  }));
  const streamTotal = revenueLines.reduce<MonthlySeries>((acc, l) => addSeries(acc, l.values), new Map());
  const revenueResidual: MonthlySeries = new Map();
  for (const [month, total] of totalRevenue) {
    const r = total - (streamTotal.get(month) ?? 0);
    revenueResidual.set(month, Math.abs(r) < 0.005 ? 0 : dRound2(r));
  }

  return {
    metrics,
    profitAndLoss,
    cashFlow,
    balanceSheet,
    totalRevenue,
    revenueByType,
    totalExpenses,
    totalCogs,
    totalOpex,
    netIncome,
    cashPosition,
    headcountSeries: headcountCosts.headcount,
    headcountCostSeries: headcountCosts.totalCost,
    headcountCostByDepartment: headcountCosts.byDepartment,
    headcountByDepartment: headcountCosts.headcountByDepartment,
    startingCash,
    hasData,
    periodStart,
    periodEnd,
    expenseLines,
    revenueLines,
    revenueResidual,
  };
}
