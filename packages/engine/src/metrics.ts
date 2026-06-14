/**
 * Metrics calculator — computes SaaS, financial, growth, and efficiency metrics.
 *
 * Takes aggregated financial data and subscription details as input,
 * returns computed metric values over time.
 *
 * Covers 62+ standard FP&A / SaaS finance metrics:
 * - Revenue: ARR, MRR, ARPA, ARPU, Revenue Run Rate, TTM
 * - Cash: Burn Rate, Runway, Cash Position
 * - SaaS: Churn, LTV, CAC, LTV:CAC, CAC Payback, Magic Number, Quick Ratio, Rule of 40
 * - Profitability: Gross Margin, EBITDA, Net Income
 * - Growth: Revenue Growth, Customer Growth, Revenue Per Employee
 * - Efficiency: Burn Multiple, Burn Productivity
 *
 * All intermediate arithmetic uses Decimal.js for precision.
 */

import type { SubscriptionDetail } from "./revenue";
import { DependencyGraph, CircularDependencyError } from "./dag";
import { type MonthlySeries, seriesToArray } from "./utils";
import { D, Decimal, dDiv, dRound2, dMax } from "./decimal";

// ── Input types ──────────────────────────────────────────────────────────────

export interface MetricsInput {
  /** Monthly total revenue */
  revenue: MonthlySeries;
  /** Monthly subscription/MRR details (if SaaS) */
  subscriptionDetails?: SubscriptionDetail[];
  /** Monthly total expenses (COGS + OpEx) */
  totalExpenses: MonthlySeries;
  /** Monthly COGS */
  cogs: MonthlySeries;
  /** Monthly operating expenses */
  operatingExpenses: MonthlySeries;
  /** Cash position (ending cash per month) */
  cashPosition: MonthlySeries;
  /** Monthly net income */
  netIncome: MonthlySeries;
  /** Monthly headcount */
  headcount: MonthlySeries;
  /** Monthly customer acquisition cost (marketing + sales spend) */
  acquisitionSpend?: MonthlySeries;
  /** Number of new customers per month (if not from subscription details) */
  newCustomers?: MonthlySeries;
  /** Monthly capital expenditures (for FCF) */
  capex?: MonthlySeries;
  /** Monthly operating cash flow (for FCF) — if not provided, approximated from netIncome */
  operatingCashFlow?: MonthlySeries;
  /** Monthly active users (for ARPU, if not in subscription details) */
  activeUsers?: MonthlySeries;
  /** Monthly current assets (for Working Capital) */
  currentAssets?: MonthlySeries;
  /** Monthly current liabilities (for Working Capital) */
  currentLiabilities?: MonthlySeries;
  /** Monthly depreciation & amortization (for EBITDA) */
  depreciationAmortization?: MonthlySeries;
  /** Monthly retention spend (for Customer Retention Cost) */
  retentionSpend?: MonthlySeries;
  /** Phase 2 D §1.4 D6 — monthly debt interest (operating; added to burn). */
  interestExpense?: MonthlySeries;
  /** Phase 2 D §1.4 D6 — monthly debt principal (financing; added to runway denominator). */
  principalPayments?: MonthlySeries;
}

/** A single computed metric value. */
export interface MetricValue {
  month: string;
  value: number;
}

/** All computed metrics. */
export interface ComputedMetrics {
  // Revenue metrics
  mrr: MetricValue[];
  arr: MetricValue[];
  totalRevenue: MetricValue[];
  revenueRunRate: MetricValue[];

  // MRR components (SaaS)
  newMrr: MetricValue[];
  expansionMrr: MetricValue[];
  churnedMrr: MetricValue[];
  netNewMrr: MetricValue[];

  // Customer metrics
  totalCustomers: MetricValue[];
  newCustomersPerMonth: MetricValue[];
  churnedCustomersPerMonth: MetricValue[];

  // SaaS metrics
  customerChurnRate: MetricValue[];
  revenueChurnRate: MetricValue[];
  ltv: MetricValue[];
  cac: MetricValue[];
  ltvCacRatio: MetricValue[];
  cacPaybackMonths: MetricValue[];
  arpa: MetricValue[];
  saasQuickRatio: MetricValue[];
  magicNumber: MetricValue[];

  // Cash metrics
  burnRate: MetricValue[];
  netBurnRate: MetricValue[];
  cashRunwayMonths: MetricValue[];
  cashPosition: MetricValue[];

  // Profitability
  grossProfit: MetricValue[];
  grossMarginPercent: MetricValue[];
  operatingIncome: MetricValue[];
  netIncome: MetricValue[];
  ebitda: MetricValue[]; // simplified: operating income for startups
  ebitdaMargin: MetricValue[]; // EBITDA / Total Revenue × 100

  // Growth
  revenueGrowthRate: MetricValue[];
  mrrGrowthRate: MetricValue[];
  customerGrowthRate: MetricValue[];
  revenuePerEmployee: MetricValue[];

  // Efficiency
  burnMultiple: MetricValue[];
  ruleOf40: MetricValue[];

  // MRR Decomposition (Tier-1)
  contractionMrr: MetricValue[];
  downgradeMrr: MetricValue[];
  reactivationMrr: MetricValue[];

  // Retention (Tier-1)
  netRevenueRetention: MetricValue[];
  grossRevenueRetention: MetricValue[];

  // Cash Flow (Tier-1)
  freeCashFlow: MetricValue[];
  fcfMargin: MetricValue[];

  // Revenue (Tier-1)
  ttmRevenue: MetricValue[];

  // Per-user (Tier-2)
  arpu: MetricValue[];

  // Churn Analysis (Tier-2)
  netChurnRate: MetricValue[];
  hasNegativeChurn: MetricValue[];

  // Efficiency (Tier-2)
  burnProductivity: MetricValue[];

  // Balance Sheet (Tier-2)
  workingCapital: MetricValue[];

  // Retention Cost (Tier-2)
  customerRetentionCost: MetricValue[];

  // Debt (Phase 5 Task 5.1 §1.4 D6) — monthly interest expense echoed from input
  interestExpense: MetricValue[];
}

// ── Core metrics computation ─────────────────────────────────────────────────

export function computeAllMetrics(input: MetricsInput): ComputedMetrics {
  const months = getSortedMonths(input.revenue);
  const subDetails = indexSubscriptionDetails(input.subscriptionDetails);

  // Revenue
  // MRR = recurring (subscription) MRR only. When a month has no subscription
  // detail it is 0 — NOT a fallback to total revenue, which would relabel
  // non-recurring revenue (one-time / IAP / services / hardware) as recurring
  // and fabricate MRR/ARR for businesses that have none (e.g. an IAP-only game).
  const mrr = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.mrr ?? 0,
  }));
  const arr = mrr.map((v) => ({ month: v.month, value: dRound2(D(v.value).mul(12)) }));
  const totalRevenue = seriesToArray(input.revenue);
  const revenueRunRate = totalRevenue.map((v) => ({
    month: v.month,
    value: dRound2(D(v.value).mul(12)),
  }));

  // MRR components
  const newMrr = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.newMrr ?? 0,
  }));
  const expansionMrr = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.expansionMrr ?? 0,
  }));
  const churnedMrr = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.churnedMrr ?? 0,
  }));
  // Net New MRR is RE-DERIVED from its 5 components rather than echoing the
  // subDetail's own netNewMrr field — a buggy/poisoned producer could set that
  // field wrong, and the canonical identity is the source of truth:
  //   New + Expansion + Reactivation − Churned − Contraction
  // contraction = contractionMrr ?? downgradeMrr ?? 0 (downgrade is the alias).
  const netNewMrr = months.map((m) => {
    const d = subDetails.get(m);
    const contraction = d?.contractionMrr ?? d?.downgradeMrr ?? 0;
    const value = D(d?.newMrr ?? 0)
      .plus(d?.expansionMrr ?? 0)
      .plus(d?.reactivationMrr ?? 0)
      .minus(d?.churnedMrr ?? 0)
      .minus(contraction);
    return { month: m, value: dRound2(value) };
  });

  // Customer metrics
  const totalCustomers = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.customers ?? 0,
  }));
  const newCustomersPerMonth = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.newCustomers ?? input.newCustomers?.get(m) ?? 0,
  }));
  const churnedCustomersPerMonth = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.churnedCustomers ?? 0,
  }));

  // Profitability (computed early — needed by LTV and CAC Payback)
  const grossProfit = months.map((m) => {
    const rev = D(input.revenue.get(m) ?? 0);
    const cog = D(input.cogs.get(m) ?? 0);
    return { month: m, value: dRound2(rev.minus(cog)) };
  });

  const grossMarginPercent = months.map((m, i) => {
    const rev = D(input.revenue.get(m) ?? 0);
    if (rev.isZero()) return { month: m, value: 0 };
    return { month: m, value: dRound2(D(grossProfit[i]?.value ?? 0).div(rev).mul(100)) };
  });

  // SaaS metrics — all using Decimal
  const customerChurnRate = months.map((m, i) => {
    const d = subDetails.get(m);
    if (!d || i === 0) return { month: m, value: 0 };
    // Beginning-of-period customers = previous month's ending count
    const prevD = subDetails.get(months[i - 1]!);
    const beginningCustomers = D(prevD?.customers ?? 0);
    if (beginningCustomers.isZero()) return { month: m, value: 0 };
    return {
      month: m,
      value: dRound2(dDiv(d.churnedCustomers, beginningCustomers).mul(100)),
    };
  });

  const revenueChurnRate = months.map((m, i) => {
    const d = subDetails.get(m);
    if (!d || i === 0) return { month: m, value: 0 };
    // Beginning-of-period MRR = previous month's ending MRR
    const prevMrrVal = D(mrr[i - 1]?.value ?? 0);
    if (prevMrrVal.isZero()) return { month: m, value: 0 };
    return {
      month: m,
      value: dRound2(dDiv(d.churnedMrr, prevMrrVal).mul(100)),
    };
  });

  // ARPA = MRR / customers
  const arpa = months.map((m) => {
    const d = subDetails.get(m);
    if (!d || d.customers === 0) return { month: m, value: 0 };
    return { month: m, value: dRound2(dDiv(d.mrr, d.customers)) };
  });

  // LTV = (ARPA × Gross Margin%) / Revenue Churn Rate
  // Phase 5.4: when churn ≤ 0 (zero churn = 100% retention, negative = net
  // expansion), LTV is mathematically infinite. Emit NaN instead of a 1M-dollar
  // sentinel so isMetricDataAvailable ghosts the card with a hint rather than
  // showing a misleading concrete dollar figure. The no-revenue case
  // (ARPA = 0, so churn is also 0) is a distinct "no LTV data" state → 0.
  const ltv = months.map((m, i) => {
    const arpaVal = D(arpa[i]?.value ?? 0);
    const gmFraction = D(grossMarginPercent[i]?.value ?? 0).div(100);
    const revChurnFraction = D(revenueChurnRate[i]?.value ?? 0).div(100);
    if (revChurnFraction.lte(0)) {
      // No revenue/ARPA → no LTV to compute (0). Revenue present but zero
      // churn → infinite LTV → NaN (ghost the card).
      return { month: m, value: arpaVal.gt(0) ? NaN : 0 };
    }
    return { month: m, value: dRound2(arpaVal.mul(gmFraction).div(revChurnFraction)) };
  });

  // CAC = acquisition spend / new customers
  // Phase 5.2 (review M2): gate the DARK case strictly on input PRESENCE —
  // acquisitionSpend absent for the month → NaN (card ghosts with a hint).
  // "Spend present but newCustomers === 0" is its OWN documented-undefined case
  // (acquisition money was spent but acquired nobody → CAC undefined, not 0).
  // Both emit NaN so isMetricDataAvailable ghosts the card instead of a wrong 0.
  const cac = months.map((m) => {
    const rawSpend = input.acquisitionSpend?.get(m);
    if (rawSpend === undefined) return { month: m, value: NaN };
    const spend = D(rawSpend);
    const newCust = D(subDetails.get(m)?.newCustomers ?? input.newCustomers?.get(m) ?? 0);
    if (newCust.isZero()) return { month: m, value: NaN };
    return { month: m, value: dRound2(spend.div(newCust)) };
  });

  const ltvCacRatio = months.map((m, i) => {
    const cacVal = cac[i]?.value ?? NaN;
    // Propagate NaN from a dark/undefined CAC; only divide when CAC is a finite, nonzero number.
    if (!Number.isFinite(cacVal) || cacVal === 0) return { month: m, value: NaN };
    return { month: m, value: dRound2(D(ltv[i]?.value ?? 0).div(D(cacVal))) };
  });

  // CAC Payback = CAC / (ARPA × Gross Margin%)
  const cacPaybackMonths = months.map((m, i) => {
    const cacVal = cac[i]?.value ?? NaN;
    // Propagate NaN from a dark/undefined CAC before the gross-margin gate.
    if (!Number.isFinite(cacVal)) return { month: m, value: NaN };
    const arpaVal = D(arpa[i]?.value ?? 0);
    const gmFraction = D(grossMarginPercent[i]?.value ?? 0).div(100);
    const monthlyGrossPerCustomer = arpaVal.mul(gmFraction);
    if (monthlyGrossPerCustomer.isZero()) return { month: m, value: 0 };
    return { month: m, value: dRound2(D(cacVal).div(monthlyGrossPerCustomer)) };
  });

  // SaaS Quick Ratio = (New MRR + Expansion MRR) / (Churned MRR + Contraction MRR)
  const saasQuickRatio = months.map((m) => {
    const d = subDetails.get(m);
    if (!d) return { month: m, value: 0 };
    const additions = D(d.newMrr).plus(d.expansionMrr);
    const losses = D(d.churnedMrr).plus(d.contractionMrr ?? d.downgradeMrr ?? 0);
    if (losses.isZero()) return { month: m, value: additions.gt(0) ? 999 : 0 };
    return { month: m, value: dRound2(additions.div(losses)) };
  });

  // Magic Number = Net New ARR (MoM) / Previous Month's S&M Spend
  // Magic Number = Net New ARR (QoQ) / Previous Quarter S&M Spend
  // Uses rolling 3-month windows when enough data, falls back to monthly
  const magicNumber = months.map((m, i) => {
    if (i < 3) {
      // Not enough for quarterly — fall back to monthly approximation
      if (i === 0) return { month: m, value: 0 }; // first month: no prior — structural N/A
      const currMrr = D(mrr[i]?.value ?? 0);
      const prevMrr = D(mrr[i - 1]?.value ?? 0);
      const netNewArr = currMrr.minus(prevMrr).mul(12);
      // Phase 5.3: dark-gate on INPUT PRESENCE. No prior-month acquisitionSpend
      // entry → NaN (ghost the card), not a misleading 0. A present-but-zero spend
      // is its own undefined (can't divide by zero S&M) → also NaN.
      const rawPrevSpend = input.acquisitionSpend?.get(months[i - 1]!);
      if (rawPrevSpend === undefined) return { month: m, value: NaN };
      const prevSpend = D(rawPrevSpend);
      if (prevSpend.isZero()) return { month: m, value: NaN };
      return { month: m, value: dRound2(netNewArr.div(prevSpend)) };
    }
    // Quarterly: net new ARR over 3 months / prior quarter S&M spend
    const currMrr = D(mrr[i]?.value ?? 0);
    const qtrAgoMrr = D(mrr[i - 3]?.value ?? 0);
    const netNewArr = currMrr.minus(qtrAgoMrr).mul(12); // annualize quarterly MRR change to ARR
    // Phase 5.3: if NO prior-quarter month carries an acquisitionSpend entry, the
    // input is absent → NaN. If entries exist but sum to zero → undefined → NaN.
    let priorQtrSpend = D(0);
    let sawSpendInput = false;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      const raw = input.acquisitionSpend?.get(months[j]!);
      if (raw !== undefined) {
        sawSpendInput = true;
        priorQtrSpend = priorQtrSpend.plus(raw);
      }
    }
    if (!sawSpendInput) return { month: m, value: NaN };
    if (priorQtrSpend.isZero()) return { month: m, value: NaN };
    return { month: m, value: dRound2(netNewArr.div(priorQtrSpend)) };
  });

  // Cash metrics — gross and net burn are distinct, coherent stats:
  //   gross burn = total cash out before revenue (operating expenses + debt interest)
  //   net burn   = max(0, gross burn − revenue)   — a profitable month has 0 net burn
  // Phase 2 D §1.4 D6: interest is an operating expense (P&L line) and belongs in burn;
  // principal is financing (cash flow only) and is added to the runway denominator instead.
  // interestExpense arrives as a separate series from FundingImpact (the engine doesn't
  // route interest through the accounts pipeline, to keep the boundary explicit).
  const grossBurnRate = months.map((m) => {
    const exp = D(input.totalExpenses.get(m) ?? 0);
    const interest = D(input.interestExpense?.get(m) ?? 0);
    return { month: m, value: dRound2(exp.plus(interest)) };
  });

  const netBurnRate = months.map((m, i) => {
    const rev = D(input.revenue.get(m) ?? 0);
    const gross = D(grossBurnRate[i]?.value ?? 0);
    return { month: m, value: dRound2(dMax(0, gross.minus(rev))) };
  });

  const cashPos = seriesToArray(input.cashPosition);

  const cashRunwayMonths = months.map((m, i) => {
    const cash = D(input.cashPosition.get(m) ?? 0);
    const operatingBurn = D(netBurnRate[i]?.value ?? 0);
    const principal = D(input.principalPayments?.get(m) ?? 0);
    // Phase 2 D §1.4 D6: runway nets total debt service. Interest is already in
    // operatingBurn (above); principal is added back here as it's a contractual cash
    // outflow that drains the runway even though it doesn't appear on the P&L.
    const totalCashConsumption = operatingBurn.plus(principal);
    if (totalCashConsumption.lte(0)) return { month: m, value: 999 };
    return { month: m, value: dRound2(cash.div(totalCashConsumption)) };
  });

  // Operating income
  const operatingIncome = months.map((m) => {
    const gp = D(grossProfit.find((g) => g.month === m)?.value ?? 0);
    const opex = D(input.operatingExpenses.get(m) ?? 0);
    return { month: m, value: dRound2(gp.minus(opex)) };
  });

  const netIncomeValues = seriesToArray(input.netIncome);

  // EBITDA = Operating Income + Depreciation & Amortization
  const ebitda = months.map((m, i) => {
    const opInc = D(operatingIncome[i]?.value ?? 0);
    const da = D(input.depreciationAmortization?.get(m) ?? 0);
    return { month: m, value: dRound2(opInc.plus(da)) };
  });

  // Growth rates (month-over-month)
  const revenueGrowthRate = computeGrowthRate(totalRevenue);
  const mrrGrowthRate = computeGrowthRate(mrr);
  const customerGrowthRate = computeGrowthRate(totalCustomers);

  // Revenue per employee (annualized)
  const revenuePerEmployee = months.map((m) => {
    const rev = D(input.revenue.get(m) ?? 0);
    const hc = D(input.headcount.get(m) ?? 0);
    if (hc.isZero()) return { month: m, value: 0 };
    return { month: m, value: dRound2(rev.mul(12).div(hc)) };
  });

  // Efficiency
  const BURN_MULTIPLE_CAP = 999;
  const burnMultiple = months.map((m, i) => {
    const burn = D(netBurnRate[i]?.value ?? 0);
    const netNew = D(netNewMrr[i]?.value ?? 0);
    if (netNew.lte(0)) return { month: m, value: burn.gt(0) ? BURN_MULTIPLE_CAP : 0 };
    return { month: m, value: dRound2(burn.div(netNew)) };
  });

  // EBITDA margin % — first-class metric. Rule of 40 reuses the *unrounded*
  // figure below so its value is unchanged by exposing this metric.
  const ebitdaMarginRaw = months.map((m, i) => {
    const rev = D(input.revenue.get(m) ?? 0);
    return rev.isZero() ? D(0) : D(ebitda[i]?.value ?? 0).div(rev).mul(100);
  });
  const ebitdaMargin = months.map((m, i) => ({
    month: m,
    value: dRound2(ebitdaMarginRaw[i]!),
  }));

  // Rule of 40 = Revenue Growth % + EBITDA Margin %
  const ruleOf40 = months.map((m, i) => {
    const growthRate = D(revenueGrowthRate[i]?.value ?? 0);
    return { month: m, value: dRound2(growthRate.plus(ebitdaMarginRaw[i]!)) };
  });

  // ── Tier-1: MRR Decomposition ──────────────────────────────────────────────
  const contractionMrr = months.map((m) => {
    const d = subDetails.get(m);
    return { month: m, value: d?.contractionMrr ?? d?.downgradeMrr ?? 0 };
  });
  const downgradeMrr = months.map((m) => {
    const d = subDetails.get(m);
    return { month: m, value: d?.downgradeMrr ?? d?.contractionMrr ?? 0 };
  });

  // Reactivation MRR — MRR from previously churned customers returning
  const reactivationMrr = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.reactivationMrr ?? 0,
  }));

  // ── Tier-1: Net Revenue Retention (NRR) ────────────────────────────────────
  const netRevenueRetention = months.map((m, i) => {
    if (i === 0) return { month: m, value: 0 };
    const currMrrVal = D(mrr[i]?.value ?? 0);
    const newMrrVal = D(newMrr[i]?.value ?? 0);
    const prevMrrVal = D(mrr[i - 1]?.value ?? 0);
    if (prevMrrVal.isZero()) return { month: m, value: 0 };
    return { month: m, value: dRound2(currMrrVal.minus(newMrrVal).div(prevMrrVal).mul(100)) };
  });

  // ── Tier-1: Gross Revenue Retention (GRR) ──────────────────────────────────
  const grossRevenueRetention = months.map((m, i) => {
    if (i === 0) return { month: m, value: 0 };
    const prevMrrVal = D(mrr[i - 1]?.value ?? 0);
    if (prevMrrVal.isZero()) return { month: m, value: 0 };
    const churned = D(churnedMrr[i]?.value ?? 0);
    const downgrade = D(contractionMrr[i]?.value ?? 0);
    const grr = D(1).minus(churned.plus(downgrade).div(prevMrrVal)).mul(100);
    return { month: m, value: dRound2(Decimal.min(D(100), grr)) };
  });

  // ── Tier-1: Free Cash Flow (FCF) ──────────────────────────────────────────
  const freeCashFlow = months.map((m) => {
    const ocf = D(input.operatingCashFlow?.get(m) ?? input.netIncome.get(m) ?? 0);
    const capexVal = D(input.capex?.get(m) ?? 0);
    return { month: m, value: dRound2(ocf.minus(capexVal)) };
  });
  const fcfMargin = months.map((m, i) => {
    const rev = D(input.revenue.get(m) ?? 0);
    if (rev.isZero()) return { month: m, value: 0 };
    return { month: m, value: dRound2(D(freeCashFlow[i]?.value ?? 0).div(rev).mul(100)) };
  });

  // ── Tier-1: TTM Revenue (trailing 12 months) ──────────────────────────────
  const ttmRevenue = months.map((m, i) => {
    let sum = D(0);
    const windowStart = Math.max(0, i - 11);
    for (let j = windowStart; j <= i; j++) {
      sum = sum.plus(totalRevenue[j]?.value ?? 0);
    }
    return { month: m, value: dRound2(sum) };
  });

  // ── Tier-2: ARPU (Average Revenue Per User) ───────────────────────────────
  const arpu = months.map((m) => {
    const d = subDetails.get(m);
    // Phase 5.3: dark-gate on INPUT PRESENCE. Active-user count comes from the
    // subscription detail or the activeUsers series; if NEITHER provides a value
    // the metric is dark → NaN (ghost the card), not a misleading zero. A
    // present-but-zero user count is its own undefined (÷0) → also NaN.
    const rawUsers = d?.activeUsers ?? input.activeUsers?.get(m);
    if (rawUsers === undefined) return { month: m, value: NaN };
    const users = D(rawUsers);
    const mrrVal = D(d?.mrr ?? input.revenue.get(m) ?? 0);
    if (users.isZero()) return { month: m, value: NaN };
    return { month: m, value: dRound2(mrrVal.div(users)) };
  });

  // ── Tier-2: Net Churn Rate / Negative Churn Detection ─────────────────────
  const netChurnRate = months.map((m, i) => {
    if (i === 0) return { month: m, value: 0 };
    const prevMrrVal = D(mrr[i - 1]?.value ?? 0);
    if (prevMrrVal.isZero()) return { month: m, value: 0 };
    const churned = D(churnedMrr[i]?.value ?? 0);
    const expansion = D(expansionMrr[i]?.value ?? 0);
    return { month: m, value: dRound2(churned.minus(expansion).div(prevMrrVal).mul(100)) };
  });
  const hasNegativeChurn = netChurnRate.map((v) => ({
    month: v.month,
    value: v.value < 0 ? 1 : 0,
  }));

  // ── Tier-2: Burn Productivity ──────────────────────────────────────────────
  const burnProductivity = months.map((m, i) => {
    if (i < 11) return { month: m, value: 0 };
    let recentGP = D(0);
    let priorGP = D(0);
    let priorOpEx = D(0);
    for (let j = i - 5; j <= i; j++) {
      recentGP = recentGP.plus(grossProfit[j]?.value ?? 0);
    }
    for (let j = i - 11; j <= i - 6; j++) {
      priorGP = priorGP.plus(grossProfit[j]?.value ?? 0);
      priorOpEx = priorOpEx.plus(input.operatingExpenses.get(months[j]!) ?? 0);
    }
    if (priorOpEx.isZero()) return { month: m, value: 0 };
    return { month: m, value: dRound2(recentGP.minus(priorGP).div(priorOpEx)) };
  });

  // ── Tier-2: Working Capital ────────────────────────────────────────────────
  const workingCapital = months.map((m) => {
    const assets = D(input.currentAssets?.get(m) ?? 0);
    const liabilities = D(input.currentLiabilities?.get(m) ?? 0);
    return { month: m, value: dRound2(assets.minus(liabilities)) };
  });

  // ── Tier-2: Customer Retention Cost ────────────────────────────────────────
  const customerRetentionCost = months.map((m) => {
    // Phase 5.3: dark-gate on INPUT PRESENCE. No retentionSpend entry for the
    // month → NaN (ghost the card), not a misleading zero. Spend present but
    // customers===0 is its own documented undefined (÷0) → also NaN.
    const rawSpend = input.retentionSpend?.get(m);
    if (rawSpend === undefined) return { month: m, value: NaN };
    const spend = D(rawSpend);
    const d = subDetails.get(m);
    const customers = D(d?.customers ?? 0);
    if (customers.isZero()) return { month: m, value: NaN };
    return { month: m, value: dRound2(spend.div(customers)) };
  });

  // ── Debt: Interest Expense (Phase 5 Task 5.1 §1.4 D6) ──────────────────────
  // Echo the per-month input series so the dashboard/explorer/AI can surface it
  // as a first-class metric. 0 when no interest input is provided.
  const interestExpenseValues = months.map((m) => ({
    month: m,
    value: dRound2(D(input.interestExpense?.get(m) ?? 0)),
  }));

  return {
    mrr,
    arr,
    totalRevenue,
    revenueRunRate,
    newMrr,
    expansionMrr,
    churnedMrr,
    netNewMrr,
    totalCustomers,
    newCustomersPerMonth,
    churnedCustomersPerMonth,
    customerChurnRate,
    revenueChurnRate,
    ltv,
    cac,
    ltvCacRatio,
    cacPaybackMonths,
    arpa,
    saasQuickRatio,
    magicNumber,
    burnRate: grossBurnRate,
    netBurnRate,
    cashRunwayMonths,
    cashPosition: cashPos,
    grossProfit,
    grossMarginPercent,
    operatingIncome,
    netIncome: netIncomeValues,
    ebitda,
    ebitdaMargin,
    revenueGrowthRate,
    mrrGrowthRate,
    customerGrowthRate,
    revenuePerEmployee,
    burnMultiple,
    ruleOf40,
    contractionMrr,
    downgradeMrr,
    reactivationMrr,
    netRevenueRetention,
    grossRevenueRetention,
    freeCashFlow,
    fcfMargin,
    ttmRevenue,
    arpu,
    netChurnRate,
    hasNegativeChurn,
    burnProductivity,
    workingCapital,
    customerRetentionCost,
    interestExpense: interestExpenseValues,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSortedMonths(series: MonthlySeries): string[] {
  return Array.from(series.keys()).sort();
}

function indexSubscriptionDetails(
  details?: SubscriptionDetail[]
): Map<string, SubscriptionDetail> {
  const map = new Map<string, SubscriptionDetail>();
  if (!details) return map;
  for (const d of details) {
    const existing = map.get(d.month);
    if (!existing) {
      map.set(d.month, { ...d });
      continue;
    }
    // Multiple subscription streams contributing to the same month — sum
    // numeric fields so MRR / customer counts reflect the portfolio total
    // rather than only the last stream processed.
    map.set(d.month, {
      month: d.month,
      customers: existing.customers + d.customers,
      newCustomers: existing.newCustomers + d.newCustomers,
      churnedCustomers: existing.churnedCustomers + d.churnedCustomers,
      mrr: existing.mrr + d.mrr,
      newMrr: existing.newMrr + d.newMrr,
      expansionMrr: existing.expansionMrr + d.expansionMrr,
      churnedMrr: existing.churnedMrr + d.churnedMrr,
      contractionMrr:
        existing.contractionMrr == null && d.contractionMrr == null
          ? undefined
          : (existing.contractionMrr ?? 0) + (d.contractionMrr ?? 0),
      downgradeMrr:
        existing.downgradeMrr == null && d.downgradeMrr == null
          ? undefined
          : (existing.downgradeMrr ?? 0) + (d.downgradeMrr ?? 0),
      reactivationMrr:
        existing.reactivationMrr == null && d.reactivationMrr == null
          ? undefined
          : (existing.reactivationMrr ?? 0) + (d.reactivationMrr ?? 0),
      netNewMrr: existing.netNewMrr + d.netNewMrr,
      activeUsers:
        existing.activeUsers == null && d.activeUsers == null
          ? undefined
          : (existing.activeUsers ?? 0) + (d.activeUsers ?? 0),
    });
  }
  return map;
}

function computeGrowthRate(values: MetricValue[]): MetricValue[] {
  return values.map((v, i) => {
    const prev = values[i - 1];
    if (i === 0 || !prev || prev.value === 0) {
      return { month: v.month, value: 0 };
    }
    const growth = D(v.value).minus(prev.value).div(prev.value).mul(100);
    return { month: v.month, value: dRound2(growth) };
  });
}

// ── Custom metric definitions (user-created formulas) ────────────────────────

/** A user-defined custom metric with a formula referencing other metrics. */
export interface CustomMetricDefinition {
  /** Unique identifier for this metric */
  id: string;
  /** Human-readable name */
  name: string;
  /** IDs of metrics this formula depends on (keys in ComputedMetrics or other custom metric IDs) */
  dependsOn: string[];
  /**
   * Compute function: receives the resolved metric values for each dependency,
   * plus the months array, and returns the computed values for this metric.
   */
  compute: (
    deps: Map<string, MetricValue[]>,
    months: string[]
  ) => MetricValue[];
}

/**
 * Compute custom metrics in dependency order using a DAG.
 *
 * Takes the already-computed built-in metrics and a set of user-defined custom
 * metric definitions. Returns a map of custom metric ID → MetricValue[].
 *
 * Throws CircularDependencyError if custom metrics form a cycle.
 */
export function computeCustomMetrics(
  builtInMetrics: ComputedMetrics,
  customDefinitions: CustomMetricDefinition[],
  months: string[]
): Map<string, MetricValue[]> {
  if (customDefinitions.length === 0) return new Map();

  // Index built-in metrics by name
  const builtInMap = new Map<string, MetricValue[]>();
  for (const [key, values] of Object.entries(builtInMetrics)) {
    if (Array.isArray(values)) {
      builtInMap.set(key, values as MetricValue[]);
    }
  }

  // Build dependency graph for custom metrics
  const graph = new DependencyGraph();
  const customIds = new Set(customDefinitions.map((d) => d.id));
  const defMap = new Map<string, CustomMetricDefinition>();

  for (const def of customDefinitions) {
    defMap.set(def.id, def);
    graph.addNode(def.id);

    for (const depId of def.dependsOn) {
      if (customIds.has(depId)) {
        graph.addDependency(def.id, depId);
      } else if (!builtInMap.has(depId)) {
        throw new Error(
          `Custom metric "${def.id}" depends on unknown metric "${depId}"`
        );
      }
    }
  }

  // Topological sort — throws CircularDependencyError on cycles
  const order = graph.topologicalSort();

  // Compute in order
  const resolved = new Map<string, MetricValue[]>();

  for (const id of order) {
    const def = defMap.get(id);
    if (!def) continue;

    const deps = new Map<string, MetricValue[]>();
    for (const depId of def.dependsOn) {
      const values = resolved.get(depId) ?? builtInMap.get(depId);
      if (values) deps.set(depId, values);
    }

    resolved.set(id, def.compute(deps, months));
  }

  return resolved;
}
