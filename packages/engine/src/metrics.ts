/**
 * Metrics calculator — computes SaaS, financial, growth, and efficiency metrics.
 *
 * Takes aggregated financial data and subscription details as input,
 * returns computed metric values over time.
 *
 * Covers the 62+ metrics standard FP&A and SaaS finance metrics:
 * - Revenue: ARR, MRR, ARPA, ARPU, Revenue Run Rate, TTM
 * - Cash: Burn Rate, Runway, Cash Position
 * - SaaS: Churn, LTV, CAC, LTV:CAC, CAC Payback, Magic Number, Quick Ratio, Rule of 40
 * - Profitability: Gross Margin, EBITDA, Net Income
 * - Growth: Revenue Growth, Customer Growth, Revenue Per Employee
 * - Efficiency: Burn Multiple, Burn Productivity
 */

import type { SubscriptionDetail } from "./revenue";
import { DependencyGraph, CircularDependencyError } from "./dag";
import { type MonthlySeries, round2, seriesToArray } from "./utils";

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
  /** Monthly retention spend (for Customer Retention Cost) */
  retentionSpend?: MonthlySeries;
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
}

// ── Core metrics computation ─────────────────────────────────────────────────

export function computeAllMetrics(input: MetricsInput): ComputedMetrics {
  const months = getSortedMonths(input.revenue);
  const subDetails = indexSubscriptionDetails(input.subscriptionDetails);

  // Revenue
  const mrr = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.mrr ?? input.revenue.get(m) ?? 0,
  }));
  const arr = mrr.map((v) => ({ month: v.month, value: round2(v.value * 12) }));
  const totalRevenue = seriesToArray(input.revenue);
  const revenueRunRate = totalRevenue.map((v) => ({
    month: v.month,
    value: round2(v.value * 12),
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
  const netNewMrr = months.map((m) => ({
    month: m,
    value: subDetails.get(m)?.netNewMrr ?? 0,
  }));

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
    const rev = input.revenue.get(m) ?? 0;
    const cog = input.cogs.get(m) ?? 0;
    return { month: m, value: round2(rev - cog) };
  });

  const grossMarginPercent = months.map((m, i) => {
    const rev = input.revenue.get(m) ?? 0;
    if (rev === 0) return { month: m, value: 0 };
    return { month: m, value: round2(((grossProfit[i]?.value ?? 0) / rev) * 100) };
  });

  // SaaS metrics
  const customerChurnRate = months.map((m) => {
    const d = subDetails.get(m);
    if (!d || d.customers === 0) return { month: m, value: 0 };
    return { month: m, value: round2((d.churnedCustomers / (d.customers + d.churnedCustomers)) * 100) };
  });

  const revenueChurnRate = months.map((m) => {
    const d = subDetails.get(m);
    if (!d || d.mrr === 0) return { month: m, value: 0 };
    return { month: m, value: round2((d.churnedMrr / (d.mrr + d.churnedMrr)) * 100) };
  });

  // ARPA = MRR / customers
  const arpa = months.map((m) => {
    const d = subDetails.get(m);
    if (!d || d.customers === 0) return { month: m, value: 0 };
    return { month: m, value: round2(d.mrr / d.customers) };
  });

  // LTV = (ARPA × Gross Margin%) / Revenue Churn Rate
  const ltv = months.map((m, i) => {
    const arpaVal = arpa[i]?.value ?? 0;
    const gmFraction = (grossMarginPercent[i]?.value ?? 0) / 100;
    const revChurnFraction = (revenueChurnRate[i]?.value ?? 0) / 100;
    if (revChurnFraction === 0) return { month: m, value: 0 };
    return { month: m, value: round2((arpaVal * gmFraction) / revChurnFraction) };
  });

  // CAC
  const cac = months.map((m) => {
    const spend = input.acquisitionSpend?.get(m) ?? 0;
    const newCust = subDetails.get(m)?.newCustomers ?? input.newCustomers?.get(m) ?? 0;
    if (newCust === 0) return { month: m, value: 0 };
    return { month: m, value: round2(spend / newCust) };
  });

  const ltvCacRatio = months.map((m, i) => {
    const cacVal = cac[i]?.value ?? 0;
    if (cacVal === 0) return { month: m, value: 0 };
    return { month: m, value: round2((ltv[i]?.value ?? 0) / cacVal) };
  });

  // CAC Payback = CAC / (ARPA × Gross Margin%)
  const cacPaybackMonths = months.map((m, i) => {
    const arpaVal = arpa[i]?.value ?? 0;
    const gmFraction = (grossMarginPercent[i]?.value ?? 0) / 100;
    const monthlyGrossPerCustomer = arpaVal * gmFraction;
    if (monthlyGrossPerCustomer === 0) return { month: m, value: 0 };
    return { month: m, value: round2((cac[i]?.value ?? 0) / monthlyGrossPerCustomer) };
  });

  // SaaS Quick Ratio = (New MRR + Expansion MRR) / (Churned MRR + Contraction MRR)
  const saasQuickRatio = months.map((m) => {
    const d = subDetails.get(m);
    if (!d) return { month: m, value: 0 };
    const additions = d.newMrr + d.expansionMrr;
    const losses = d.churnedMrr + (d.contractionMrr ?? d.downgradeMrr ?? 0);
    if (losses === 0) return { month: m, value: additions > 0 ? 999 : 0 };
    return { month: m, value: round2(additions / losses) };
  });

  // Magic Number = Net New ARR (QoQ) / Previous Quarter's S&M Spend
  // Simplified: monthly approximation
  const magicNumber = months.map((m, i) => {
    if (i === 0) return { month: m, value: 0 };
    const currMrr = mrr[i]?.value ?? 0;
    const prevMrr = mrr[i - 1]?.value ?? 0;
    const netNewArr = (currMrr - prevMrr) * 12;
    const prevMonth = months[i - 1] ?? m;
    const prevSpend = input.acquisitionSpend?.get(prevMonth) ?? 0;
    if (prevSpend === 0) return { month: m, value: 0 };
    return { month: m, value: round2(netNewArr / prevSpend) };
  });

  // Cash metrics
  const expenses = seriesToArray(input.totalExpenses);
  const grossBurnRate = expenses.map((v) => ({
    month: v.month,
    value: v.value,
  }));

  const netBurnRate = months.map((m) => {
    const rev = input.revenue.get(m) ?? 0;
    const exp = input.totalExpenses.get(m) ?? 0;
    const net = exp - rev;
    return { month: m, value: round2(Math.max(0, net)) }; // 0 if profitable
  });

  const cashPos = seriesToArray(input.cashPosition);

  const cashRunwayMonths = months.map((m, i) => {
    const cash = input.cashPosition.get(m) ?? 0;
    const burn = netBurnRate[i]?.value ?? 0;
    if (burn <= 0) return { month: m, value: 999 };
    return { month: m, value: round2(cash / burn) };
  });

  // Operating income (grossProfit and grossMarginPercent already computed above)
  const operatingIncome = months.map((m) => {
    const gp = grossProfit.find((g) => g.month === m)?.value ?? 0;
    const opex = input.operatingExpenses.get(m) ?? 0;
    return { month: m, value: round2(gp - opex) };
  });

  const netIncomeValues = seriesToArray(input.netIncome);
  const ebitda = operatingIncome; // simplified for startups (no D&A tracked separately)

  // Growth rates (month-over-month)
  const revenueGrowthRate = computeGrowthRate(totalRevenue);
  const mrrGrowthRate = computeGrowthRate(mrr);
  const customerGrowthRate = computeGrowthRate(totalCustomers);

  // Revenue per employee
  const revenuePerEmployee = months.map((m) => {
    const rev = input.revenue.get(m) ?? 0;
    const hc = input.headcount.get(m) ?? 0;
    if (hc === 0) return { month: m, value: 0 };
    return { month: m, value: round2((rev * 12) / hc) }; // annualized
  });

  // Efficiency
  const burnMultiple = months.map((m, i) => {
    const burn = netBurnRate[i]?.value ?? 0;
    const netNew = netNewMrr[i]?.value ?? 0;
    if (netNew <= 0) return { month: m, value: 0 };
    return { month: m, value: round2(burn / netNew) };
  });

  const ruleOf40 = months.map((m, i) => {
    const growthRate = revenueGrowthRate[i]?.value ?? 0;
    const margin = grossMarginPercent[i]?.value ?? 0;
    return { month: m, value: round2(growthRate + margin) };
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

  // ── Tier-1: Net Revenue Retention (NRR) ────────────────────────────────────
  // (Ending MRR - New MRR) / Prior Month Ending MRR × 100
  const netRevenueRetention = months.map((m, i) => {
    if (i === 0) return { month: m, value: 0 };
    const currMrrVal = mrr[i]?.value ?? 0;
    const newMrrVal = newMrr[i]?.value ?? 0;
    const prevMrrVal = mrr[i - 1]?.value ?? 0;
    if (prevMrrVal === 0) return { month: m, value: 0 };
    return { month: m, value: round2(((currMrrVal - newMrrVal) / prevMrrVal) * 100) };
  });

  // ── Tier-1: Gross Revenue Retention (GRR) ──────────────────────────────────
  // (1 - [(Churned MRR + Downgrade MRR) / Prior Month Ending MRR]) × 100
  const grossRevenueRetention = months.map((m, i) => {
    if (i === 0) return { month: m, value: 0 };
    const prevMrrVal = mrr[i - 1]?.value ?? 0;
    if (prevMrrVal === 0) return { month: m, value: 0 };
    const churned = churnedMrr[i]?.value ?? 0;
    const downgrade = contractionMrr[i]?.value ?? 0;
    const grr = (1 - (churned + downgrade) / prevMrrVal) * 100;
    return { month: m, value: round2(Math.min(100, grr)) }; // GRR never exceeds 100%
  });

  // ── Tier-1: Free Cash Flow (FCF) ──────────────────────────────────────────
  const freeCashFlow = months.map((m) => {
    const ocf = input.operatingCashFlow?.get(m) ?? input.netIncome.get(m) ?? 0;
    const capexVal = input.capex?.get(m) ?? 0;
    return { month: m, value: round2(ocf - capexVal) };
  });
  const fcfMargin = months.map((m, i) => {
    const rev = input.revenue.get(m) ?? 0;
    if (rev === 0) return { month: m, value: 0 };
    return { month: m, value: round2(((freeCashFlow[i]?.value ?? 0) / rev) * 100) };
  });

  // ── Tier-1: TTM Revenue (trailing 12 months) ──────────────────────────────
  const ttmRevenue = months.map((m, i) => {
    let sum = 0;
    const windowStart = Math.max(0, i - 11);
    for (let j = windowStart; j <= i; j++) {
      sum += totalRevenue[j]?.value ?? 0;
    }
    return { month: m, value: round2(sum) };
  });

  // ── Tier-2: ARPU (Average Revenue Per User) ───────────────────────────────
  const arpu = months.map((m) => {
    const d = subDetails.get(m);
    const users = d?.activeUsers ?? input.activeUsers?.get(m) ?? 0;
    const mrrVal = d?.mrr ?? input.revenue.get(m) ?? 0;
    if (users === 0) return { month: m, value: 0 };
    return { month: m, value: round2(mrrVal / users) };
  });

  // ── Tier-2: Net Churn Rate / Negative Churn Detection ─────────────────────
  // (Churned MRR - Expansion MRR) / Prior MRR — negative = good (expansion > churn)
  const netChurnRate = months.map((m, i) => {
    if (i === 0) return { month: m, value: 0 };
    const prevMrrVal = mrr[i - 1]?.value ?? 0;
    if (prevMrrVal === 0) return { month: m, value: 0 };
    const churned = churnedMrr[i]?.value ?? 0;
    const expansion = expansionMrr[i]?.value ?? 0;
    return { month: m, value: round2(((churned - expansion) / prevMrrVal) * 100) };
  });
  const hasNegativeChurn = netChurnRate.map((v) => ({
    month: v.month,
    value: v.value < 0 ? 1 : 0, // 1 = negative churn (good), 0 = positive churn
  }));

  // ── Tier-2: Burn Productivity ──────────────────────────────────────────────
  // Change in Gross Profit (recent 6mo vs prior 6mo) / Total OpEx (prior 6mo)
  const burnProductivity = months.map((m, i) => {
    if (i < 11) return { month: m, value: 0 }; // need 12 months
    let recentGP = 0;
    let priorGP = 0;
    let priorOpEx = 0;
    for (let j = i - 5; j <= i; j++) {
      recentGP += grossProfit[j]?.value ?? 0;
    }
    for (let j = i - 11; j <= i - 6; j++) {
      priorGP += grossProfit[j]?.value ?? 0;
      priorOpEx += input.operatingExpenses.get(months[j]!) ?? 0;
    }
    if (priorOpEx === 0) return { month: m, value: 0 };
    return { month: m, value: round2((recentGP - priorGP) / priorOpEx) };
  });

  // ── Tier-2: Working Capital ────────────────────────────────────────────────
  const workingCapital = months.map((m) => {
    const assets = input.currentAssets?.get(m) ?? 0;
    const liabilities = input.currentLiabilities?.get(m) ?? 0;
    return { month: m, value: round2(assets - liabilities) };
  });

  // ── Tier-2: Customer Retention Cost ────────────────────────────────────────
  const customerRetentionCost = months.map((m) => {
    const spend = input.retentionSpend?.get(m) ?? 0;
    const d = subDetails.get(m);
    const customers = d?.customers ?? 0;
    if (customers === 0) return { month: m, value: 0 };
    return { month: m, value: round2(spend / customers) };
  });

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
    revenueGrowthRate,
    mrrGrowthRate,
    customerGrowthRate,
    revenuePerEmployee,
    burnMultiple,
    ruleOf40,
    contractionMrr,
    downgradeMrr,
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
    map.set(d.month, d);
  }
  return map;
}

function computeGrowthRate(values: MetricValue[]): MetricValue[] {
  return values.map((v, i) => {
    const prev = values[i - 1];
    if (i === 0 || !prev || prev.value === 0) {
      return { month: v.month, value: 0 };
    }
    const growth = ((v.value - prev.value) / prev.value) * 100;
    return { month: v.month, value: round2(growth) };
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
      // Only add graph edges for dependencies on OTHER custom metrics
      // Built-in metrics are always available (no ordering needed)
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

    // Gather dependencies
    const deps = new Map<string, MetricValue[]>();
    for (const depId of def.dependsOn) {
      const values = resolved.get(depId) ?? builtInMap.get(depId);
      if (values) deps.set(depId, values);
    }

    resolved.set(id, def.compute(deps, months));
  }

  return resolved;
}
