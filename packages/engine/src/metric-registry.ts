/**
 * Metric Registry — the single source of truth for all financial metrics.
 *
 * Each entry describes:
 * - How the metric is calculated (human-readable formula)
 * - What it depends on (for DAG visualization)
 * - How to display it (format, color, icon hint)
 * - What benchmarks exist (industry standards)
 * - What tier it belongs to (core, advanced, deep)
 *
 * This registry drives:
 * - Stats catalog UI (browsing, searching)
 * - Formula dependency visualization
 * - Dashboard card configuration
 * - Mode system (which metrics to show in each mode)
 */

import type { ComputedMetrics } from "./metrics";

// ── Types ────────────────────────────────────────────────────────────────────

export type MetricCategory =
  | "revenue"
  | "cash"
  | "saas"
  | "profitability"
  | "growth"
  | "efficiency"
  | "retention"
  | "cash_flow"
  | "balance_sheet"
  | "customer"
  | "expense";

export type MetricTier = "core" | "advanced" | "deep";

export type MetricFormat =
  | "currency"
  | "percent"
  | "number"
  | "months"
  | "ratio"
  | "multiple"
  | "boolean";

/**
 * DASH-10: Friendly human labels for each MetricFormat token. Single source of
 * truth for UI surfaces (e.g. the formula viewer) that would otherwise leak the
 * internal enum ("CURRENCY"/"PERCENT"). Plain words only — NO currency symbols
 * (guarded by no-currency-in-engine.test.ts). Must cover every MetricFormat
 * union member.
 */
export const FORMAT_LABELS: Record<MetricFormat, string> = {
  currency: "Money",
  percent: "Percentage",
  months: "Months",
  number: "Number",
  ratio: "Ratio",
  multiple: "Multiple",
  boolean: "Yes/No",
};

export type SignalDirection = "higher_better" | "lower_better" | "neutral";

export interface MetricBenchmark {
  /** Label shown in UI, e.g. "Median 65%" */
  label: string;
  /** Good threshold — at or beyond this, show green */
  good: number;
  /** Warning threshold — between warn and good, show amber */
  warn: number;
  /** Direction of comparison */
  direction: SignalDirection;
}

export interface MetricDefinition {
  /** Key matching ComputedMetrics field name */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Short description (1 line) */
  description: string;
  /** Human-readable formula string */
  formula: string;
  /** Metric keys this depends on (for DAG) */
  dependsOn: string[];
  /** Category grouping */
  category: MetricCategory;
  /** Tier: core (hero KPIs), advanced (secondary), deep (specialist) */
  tier: MetricTier;
  /** Display format */
  format: MetricFormat;
  /** Whether higher or lower is better */
  direction: SignalDirection;
  /** Industry benchmark (optional) */
  benchmark?: MetricBenchmark;
  /** Lucide icon name hint (used by UI) */
  icon: string;
  /** Default accent color class */
  color: string;
  /** Link to drill-down page */
  href: string;
  /** Whether this metric requires SaaS/subscription data */
  requiresSaaS?: boolean;
  /**
   * Parent metric slug for drill-down hierarchies (umbrella §1.4).
   * When set, this metric is a component of `parentMetricId`.
   * Parent metrics have no `parentMetricId`. Drill-down UI queries
   * children via `getMetricChildren(parentSlug)`.
   *
   * **Convention note (Phase 3 F §F3):** within a parent/child family,
   * children declare `dependsOn: [parent]`. Structurally that is inverted
   * (a parent value is the sum of its children), but `dependsOn` here means
   * "evaluation predecessor" — parents are computed first from raw data,
   * then components are derived. The DAG consumer (`packages/engine/src/dag.ts`)
   * treats `dependsOn` as ordering, not composition. Do not flip the direction
   * without auditing every `dependsOn` consumer.
   */
  parentMetricId?: string;
  /**
   * AI context inclusion hint (umbrella §1.4). Lets prompt builders pick
   * parent-only, components-only, or both when serializing a metric family
   * to AI context. Defaults to 'both' when omitted.
   */
  aiContext?: {
    include: "parent_only" | "components_only" | "both";
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const METRIC_REGISTRY: MetricDefinition[] = [
  // ── Core Hero KPIs (Tier 0) ──────────────────────────────────────────────

  // Phase 2 D §1.4 D6: cashPosition now accounts for debt drawdowns and repayments
  {
    slug: "cashPosition",
    name: "Cash Position",
    description: "Total cash available, net of equity funding, debt drawdowns, principal repayments, and cumulative net income",
    formula: "Starting Cash + Equity Inflows + Debt Drawdowns − Principal Repayments + Cumulative Net Income",
    dependsOn: ["netIncome"],
    category: "cash",
    tier: "core",
    format: "currency",
    direction: "higher_better",
    icon: "Wallet",
    color: "emerald",
    href: "/funding",
    aiContext: { include: "both" },
  },
  // Phase 2 D §1.4 D6: netBurnRate excludes debt principal (financing item); includes interestExpense (operating item)
  {
    slug: "netBurnRate",
    name: "Net Burn",
    description: "Net cash consumed per month after revenue (gross burn − revenue, floored at 0); includes interest expense but excludes debt principal repayments (financing item)",
    formula: "max(0, Gross Burn − Total Revenue)",
    dependsOn: ["totalRevenue", "burnRate"],
    category: "cash",
    tier: "core",
    format: "currency",
    direction: "lower_better",
    icon: "Flame",
    color: "orange",
    href: "/expenses",
    aiContext: { include: "both" },
  },
  // Phase 2 D §1.4 D6: cashRunwayMonths denominator now includes debt service (principal + interest)
  {
    slug: "cashRunwayMonths",
    name: "Runway",
    description: "Months of cash remaining accounting for full debt service obligations (operating burn + principal repayments)",
    formula: "Cash Position / (Net Burn Rate + Principal Repayments) — Net Burn Rate already includes Debt Service interest component",
    dependsOn: ["cashPosition", "netBurnRate"],
    category: "cash",
    tier: "core",
    format: "months",
    direction: "higher_better",
    benchmark: {
      label: "12+ months",
      good: 12,
      warn: 6,
      direction: "higher_better",
    },
    icon: "Clock",
    color: "blue",
    href: "/scenarios",
    aiContext: { include: "both" },
  },
  {
    slug: "mrr",
    name: "MRR",
    description: "Monthly recurring revenue from subscriptions",
    formula: "Sum of active subscription MRR",
    dependsOn: [],
    category: "revenue",
    tier: "core",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "TrendingUp",
    color: "violet",
    href: "/revenue",
  },

  // ── Revenue Metrics ──────────────────────────────────────────────────────

  {
    slug: "arr",
    name: "ARR",
    description: "Annual recurring revenue — MRR annualized",
    formula: "MRR × 12",
    dependsOn: ["mrr"],
    category: "revenue",
    tier: "core",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "TrendingUp",
    color: "violet",
    href: "/revenue",
  },
  {
    slug: "totalRevenue",
    name: "Total Revenue",
    description: "All revenue streams combined for the month",
    formula: "Sum of all revenue streams",
    dependsOn: [],
    category: "revenue",
    tier: "core",
    format: "currency",
    direction: "higher_better",
    icon: "DollarSign",
    color: "emerald",
    href: "/revenue",
    aiContext: { include: "both" },
  },

  // ── Revenue mix components (under totalRevenue) ──────────────────────────
  {
    slug: "subscriptionRevenue",
    name: "Subscription Revenue",
    description: "Revenue from subscription streams",
    formula: "Sum of subscription stream MRR",
    dependsOn: ["totalRevenue"],
    parentMetricId: "totalRevenue",
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Repeat",
    color: "violet",
    href: "/revenue",
  },
  {
    slug: "oneTimeRevenue",
    name: "One-Time Revenue",
    description: "Revenue from one-time / non-recurring streams",
    formula: "Sum of one_time stream revenue",
    dependsOn: ["totalRevenue"],
    parentMetricId: "totalRevenue",
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Tag",
    color: "amber",
    href: "/revenue",
  },
  {
    slug: "usageRevenue",
    name: "Usage Revenue",
    description: "Revenue from consumption-based streams",
    formula: "Sum of usage_based stream revenue",
    dependsOn: ["totalRevenue"],
    parentMetricId: "totalRevenue",
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Activity",
    color: "sky",
    href: "/revenue",
  },
  {
    slug: "servicesRevenue",
    name: "Services Revenue",
    description: "Revenue from time-based services / consulting",
    formula: "Sum of services stream revenue",
    dependsOn: ["totalRevenue"],
    parentMetricId: "totalRevenue",
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Briefcase",
    color: "indigo",
    href: "/revenue",
  },
  {
    slug: "marketplaceRevenue",
    name: "Marketplace Revenue",
    description: "Take-rate revenue from marketplace GMV",
    formula: "Sum of marketplace stream revenue (GMV × take rate)",
    dependsOn: ["totalRevenue"],
    parentMetricId: "totalRevenue",
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Globe",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "ecommerceRevenue",
    name: "E-commerce Revenue",
    description: "Revenue from e-commerce orders",
    formula: "Orders × AOV per stream, summed",
    dependsOn: ["totalRevenue"],
    parentMetricId: "totalRevenue",
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "ShoppingCart",
    color: "rose",
    href: "/revenue",
  },
  {
    slug: "hardwareRevenue",
    name: "Hardware Revenue",
    description: "Revenue from hardware / physical-unit sales",
    formula: "Units × price per stream, summed",
    dependsOn: ["totalRevenue"],
    parentMetricId: "totalRevenue",
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Cpu",
    color: "slate",
    href: "/revenue",
  },

  {
    slug: "revenueRunRate",
    name: "Revenue Run Rate",
    description: "Current monthly revenue annualized",
    formula: "Total Revenue × 12",
    dependsOn: ["totalRevenue"],
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Zap",
    color: "amber",
    href: "/revenue",
  },

  // ── MRR Components ───────────────────────────────────────────────────────

  {
    slug: "newMrr",
    name: "New MRR",
    description: "MRR from newly acquired customers",
    formula: "Sum of MRR from new subscriptions",
    dependsOn: [],
    category: "saas",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "UserPlus",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "expansionMrr",
    name: "Expansion MRR",
    description: "MRR growth from existing customers upgrading",
    formula: "Sum of MRR increases from upgrades",
    dependsOn: [],
    category: "saas",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "ArrowUpRight",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "churnedMrr",
    name: "Churned MRR",
    description: "MRR lost from customers leaving",
    formula: "Sum of MRR from cancelled subscriptions",
    dependsOn: [],
    category: "saas",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "UserMinus",
    color: "red",
    href: "/revenue",
  },
  {
    slug: "netNewMrr",
    name: "Net New MRR",
    description: "Net change in MRR after adds, expansions, and churn",
    formula: "New MRR + Expansion MRR - Churned MRR",
    dependsOn: ["newMrr", "expansionMrr", "churnedMrr"],
    category: "saas",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "TrendingUp",
    color: "blue",
    href: "/revenue",
  },
  {
    slug: "contractionMrr",
    name: "Contraction MRR",
    description: "MRR lost from existing customers downgrading",
    formula: "Sum of MRR decreases from downgrades",
    dependsOn: [],
    category: "saas",
    tier: "deep",
    format: "currency",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "ArrowDownRight",
    color: "orange",
    href: "/revenue",
  },
  {
    slug: "reactivationMrr",
    name: "Reactivation MRR",
    description: "MRR from previously churned customers returning",
    formula: "Sum of MRR from reactivated subscriptions",
    dependsOn: [],
    category: "saas",
    tier: "deep",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "RefreshCw",
    color: "emerald",
    href: "/revenue",
  },

  // ── Customer Metrics ─────────────────────────────────────────────────────

  {
    slug: "totalCustomers",
    name: "Total Customers",
    description: "Active paying customers at end of month",
    formula: "Count of active subscriptions",
    dependsOn: [],
    category: "customer",
    tier: "advanced",
    format: "number",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "Users",
    color: "blue",
    href: "/revenue",
  },
  {
    slug: "newCustomersPerMonth",
    name: "New Customers",
    description: "Customers acquired this month",
    formula: "Count of new subscriptions started",
    dependsOn: [],
    category: "customer",
    tier: "advanced",
    format: "number",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "UserPlus",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "churnedCustomersPerMonth",
    name: "Churned Customers",
    description: "Customers lost this month",
    formula: "Count of cancelled subscriptions",
    dependsOn: [],
    category: "customer",
    tier: "advanced",
    format: "number",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "UserMinus",
    color: "red",
    href: "/revenue",
  },

  // ── SaaS Metrics ─────────────────────────────────────────────────────────

  {
    slug: "customerChurnRate",
    name: "Customer Churn Rate",
    description: "Percentage of customers lost per month",
    formula: "Churned Customers / (Total Customers + Churned Customers) × 100",
    dependsOn: ["churnedCustomersPerMonth", "totalCustomers"],
    category: "saas",
    tier: "advanced",
    format: "percent",
    direction: "lower_better",
    benchmark: {
      label: "< 5%/mo",
      good: 5,
      warn: 10,
      direction: "lower_better",
    },
    requiresSaaS: true,
    icon: "TrendingDown",
    color: "red",
    href: "/revenue",
  },
  {
    slug: "revenueChurnRate",
    name: "Revenue Churn Rate",
    description: "Percentage of MRR lost per month",
    formula: "Churned MRR / (MRR + Churned MRR) × 100",
    dependsOn: ["churnedMrr", "mrr"],
    category: "saas",
    tier: "advanced",
    format: "percent",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "TrendingDown",
    color: "red",
    href: "/revenue",
  },
  {
    slug: "arpa",
    name: "ARPA",
    description: "Average revenue per account per month",
    formula: "MRR / Total Customers",
    dependsOn: ["mrr", "totalCustomers"],
    category: "saas",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "DollarSign",
    color: "violet",
    href: "/revenue",
  },
  {
    slug: "ltv",
    name: "LTV",
    description: "Customer lifetime value",
    formula: "(ARPA × Gross Margin%) / Revenue Churn Rate",
    dependsOn: ["arpa", "grossMarginPercent", "revenueChurnRate"],
    category: "saas",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "Heart",
    color: "pink",
    href: "/revenue",
  },
  {
    slug: "cac",
    name: "CAC",
    description: "Customer acquisition cost",
    formula: "Acquisition Spend / New Customers",
    dependsOn: ["newCustomersPerMonth"],
    category: "saas",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "Target",
    color: "orange",
    href: "/expenses",
  },
  {
    slug: "ltvCacRatio",
    name: "LTV:CAC",
    description: "Return on customer acquisition investment",
    formula: "LTV / CAC",
    dependsOn: ["ltv", "cac"],
    category: "saas",
    tier: "advanced",
    format: "ratio",
    direction: "higher_better",
    benchmark: {
      label: "Target: 3x",
      good: 3,
      warn: 1.5,
      direction: "higher_better",
    },
    requiresSaaS: true,
    icon: "Scale",
    color: "blue",
    href: "/revenue",
  },
  {
    slug: "cacPaybackMonths",
    name: "CAC Payback",
    description: "Months to recover customer acquisition cost",
    formula: "CAC / (ARPA × Gross Margin%)",
    dependsOn: ["cac", "arpa", "grossMarginPercent"],
    category: "saas",
    tier: "advanced",
    format: "months",
    direction: "lower_better",
    benchmark: {
      label: "< 12 mo",
      good: 12,
      warn: 18,
      direction: "lower_better",
    },
    requiresSaaS: true,
    icon: "Timer",
    color: "amber",
    href: "/revenue",
  },
  {
    slug: "saasQuickRatio",
    name: "SaaS Quick Ratio",
    description: "Revenue growth efficiency — how fast you add vs lose MRR",
    formula: "(New MRR + Expansion MRR) / (Churned MRR + Contraction MRR)",
    dependsOn: ["newMrr", "expansionMrr", "churnedMrr", "contractionMrr"],
    category: "saas",
    tier: "advanced",
    format: "ratio",
    direction: "higher_better",
    benchmark: {
      label: "Good > 4x",
      good: 4,
      warn: 2,
      direction: "higher_better",
    },
    requiresSaaS: true,
    icon: "Gauge",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "magicNumber",
    name: "Magic Number",
    description: "Sales efficiency — revenue generated per dollar of S&M spend",
    formula: "Net New ARR (QoQ) / Prior Quarter S&M Spend",
    dependsOn: ["mrr"],
    category: "saas",
    tier: "deep",
    format: "ratio",
    direction: "higher_better",
    benchmark: {
      label: "Good > 0.75",
      good: 0.75,
      warn: 0.5,
      direction: "higher_better",
    },
    requiresSaaS: true,
    icon: "Sparkles",
    color: "violet",
    href: "/revenue",
  },

  // ── Profitability ────────────────────────────────────────────────────────

  {
    slug: "grossProfit",
    name: "Gross Profit",
    description: "Revenue minus cost of goods sold",
    formula: "Total Revenue - COGS",
    dependsOn: ["totalRevenue"],
    category: "profitability",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "TrendingUp",
    color: "emerald",
    href: "/reports",
  },
  {
    slug: "grossMarginPercent",
    name: "Gross Margin",
    description: "Percentage of revenue retained after COGS",
    formula: "Gross Profit / Total Revenue × 100",
    dependsOn: ["grossProfit", "totalRevenue"],
    category: "profitability",
    tier: "core",
    format: "percent",
    direction: "higher_better",
    benchmark: {
      label: "Median 65%",
      good: 65,
      warn: 50,
      direction: "higher_better",
    },
    icon: "Percent",
    color: "emerald",
    href: "/reports",
  },
  {
    slug: "operatingIncome",
    name: "Operating Income",
    description: "Profit from operations before interest and taxes",
    formula: "Gross Profit - Operating Expenses",
    dependsOn: ["grossProfit"],
    category: "profitability",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Building2",
    color: "blue",
    href: "/reports",
  },
  {
    slug: "netIncome",
    name: "Net Income",
    description: "Bottom-line profit after all expenses",
    formula: "Total Revenue - Total Expenses",
    dependsOn: ["totalRevenue"],
    category: "profitability",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "BadgeDollarSign",
    color: "emerald",
    href: "/reports",
  },
  {
    slug: "ebitda",
    name: "EBITDA",
    description: "Earnings before interest, taxes, depreciation, and amortization",
    formula: "Operating Income + Depreciation & Amortization",
    dependsOn: ["operatingIncome"],
    category: "profitability",
    tier: "core",
    format: "currency",
    direction: "higher_better",
    icon: "BarChart3",
    color: "blue",
    href: "/reports",
  },
  {
    slug: "ebitdaMargin",
    name: "EBITDA Margin",
    description: "EBITDA as a percentage of total revenue",
    formula: "EBITDA / Total Revenue × 100",
    dependsOn: ["ebitda", "totalRevenue"],
    category: "profitability",
    tier: "advanced",
    format: "percent",
    direction: "higher_better",
    icon: "BarChart3",
    color: "blue",
    href: "/reports",
  },

  // ── Cash Metrics ─────────────────────────────────────────────────────────

  {
    slug: "burnRate",
    name: "Gross Burn",
    description: "Total cash out per month before revenue (operating expenses + debt interest)",
    formula: "Total Expenses + Interest Expense",
    dependsOn: [],
    category: "cash",
    tier: "core",
    format: "currency",
    direction: "lower_better",
    icon: "Flame",
    color: "orange",
    href: "/expenses",
    aiContext: { include: "both" },
  },

  // ── Expense Mix (totalOpex parent + components, umbrella §1.4) ───────────

  {
    slug: "totalOpex",
    name: "Total Operating Expenses",
    description: "All operating expenses combined for the month",
    formula: "Sum of forecast lines on operating_expense and cogs accounts + personnel costs",
    dependsOn: [],
    category: "expense",
    tier: "core",
    format: "currency",
    direction: "lower_better",
    icon: "TrendingDown",
    color: "rose",
    href: "/expenses",
    aiContext: { include: "both" },
  },
  {
    slug: "fixedExpenses",
    name: "Fixed Expenses",
    description: "Sum of forecast lines using the fixed method",
    formula: "Sum where forecastLines.method = 'fixed'",
    dependsOn: ["totalOpex"],
    parentMetricId: "totalOpex",
    category: "expense",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Lock",
    color: "slate",
    href: "/expenses",
  },
  {
    slug: "variableExpenses",
    name: "Variable Expenses",
    description: "Sum of growth-rate and per-unit forecast lines",
    formula: "Sum where forecastLines.method ∈ {growth_rate, per_unit}",
    dependsOn: ["totalOpex"],
    parentMetricId: "totalOpex",
    category: "expense",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Activity",
    color: "amber",
    href: "/expenses",
  },
  {
    slug: "percentageDrivenExpenses",
    name: "Percentage-Driven Expenses",
    description: "Sum of forecast lines tied to a percentage of another driver",
    formula: "Sum where forecastLines.method ∈ {percentage_of, custom_formula}",
    dependsOn: ["totalOpex"],
    parentMetricId: "totalOpex",
    category: "expense",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Percent",
    color: "violet",
    href: "/expenses",
  },
  {
    slug: "oneTimeExpenses",
    name: "One-Time Expenses",
    description: "Sum of forecast lines flagged isOneTime",
    formula: "Sum where forecastLines.isOneTime = true",
    dependsOn: ["totalOpex"],
    parentMetricId: "totalOpex",
    category: "expense",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Zap",
    color: "rose",
    href: "/expenses",
  },

  // ── Growth ───────────────────────────────────────────────────────────────

  {
    slug: "revenueGrowthRate",
    name: "Revenue Growth",
    description: "Month-over-month revenue growth rate",
    formula: "(Current Revenue - Previous Revenue) / Previous Revenue × 100",
    dependsOn: ["totalRevenue"],
    category: "growth",
    tier: "core",
    format: "percent",
    direction: "higher_better",
    icon: "TrendingUp",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "mrrGrowthRate",
    name: "MRR Growth",
    description: "Month-over-month MRR growth rate",
    formula: "(Current MRR - Previous MRR) / Previous MRR × 100",
    dependsOn: ["mrr"],
    category: "growth",
    tier: "advanced",
    format: "percent",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "TrendingUp",
    color: "violet",
    href: "/revenue",
  },
  {
    slug: "customerGrowthRate",
    name: "Customer Growth",
    description: "Month-over-month customer growth rate",
    formula: "(Current Customers - Previous Customers) / Previous Customers × 100",
    dependsOn: ["totalCustomers"],
    category: "growth",
    tier: "advanced",
    format: "percent",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "Users",
    color: "blue",
    href: "/revenue",
  },
  {
    slug: "revenuePerEmployee",
    name: "Revenue per Employee",
    description: "Annualized revenue divided by headcount",
    formula: "Total Revenue × 12 / Headcount",
    dependsOn: ["totalRevenue"],
    category: "efficiency",
    tier: "core",
    format: "currency",
    direction: "higher_better",
    icon: "User",
    color: "blue",
    href: "/team",
  },

  // ── Efficiency ───────────────────────────────────────────────────────────

  {
    slug: "burnMultiple",
    name: "Burn Multiple",
    description: "How much cash burned per dollar of net new ARR",
    formula: "Net Burn Rate / Net New MRR",
    dependsOn: ["netBurnRate", "netNewMrr"],
    category: "efficiency",
    tier: "core",
    format: "multiple",
    direction: "lower_better",
    benchmark: {
      label: "Good < 2x",
      good: 2,
      warn: 3,
      direction: "lower_better",
    },
    icon: "Gauge",
    color: "amber",
    href: "/expenses",
  },
  {
    slug: "ruleOf40",
    name: "Rule of 40",
    description: "Revenue growth % plus profit margin % — health check for SaaS",
    formula: "Revenue Growth Rate + EBITDA Margin %",
    dependsOn: ["revenueGrowthRate", "ebitda"],
    category: "efficiency",
    tier: "core",
    format: "number",
    direction: "higher_better",
    benchmark: {
      label: "Target: 40",
      good: 40,
      warn: 30,
      direction: "higher_better",
    },
    icon: "Target",
    color: "emerald",
    href: "/reports",
  },

  // ── Retention (Tier 1) ───────────────────────────────────────────────────

  {
    slug: "netRevenueRetention",
    name: "Net Revenue Retention",
    description: "Revenue retained from existing customers including expansions",
    formula: "(MRR - New MRR) / Previous MRR × 100",
    dependsOn: ["mrr", "newMrr"],
    category: "retention",
    tier: "advanced",
    format: "percent",
    direction: "higher_better",
    benchmark: {
      label: "Target > 100%",
      good: 100,
      warn: 90,
      direction: "higher_better",
    },
    requiresSaaS: true,
    icon: "ShieldCheck",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "grossRevenueRetention",
    name: "Gross Revenue Retention",
    description: "Revenue retained from existing customers excluding expansions",
    formula: "(1 - (Churned MRR + Contraction MRR) / Previous MRR) × 100",
    dependsOn: ["churnedMrr", "contractionMrr", "mrr"],
    category: "retention",
    tier: "advanced",
    format: "percent",
    direction: "higher_better",
    benchmark: {
      label: "Target > 90%",
      good: 90,
      warn: 80,
      direction: "higher_better",
    },
    requiresSaaS: true,
    icon: "Shield",
    color: "blue",
    href: "/revenue",
  },

  // ── Cash Flow (Tier 1) ───────────────────────────────────────────────────

  {
    slug: "freeCashFlow",
    name: "Free Cash Flow",
    description: "Operating cash flow minus capital expenditures",
    formula: "Operating Cash Flow - CapEx",
    dependsOn: ["netIncome"],
    category: "cash_flow",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Banknote",
    color: "emerald",
    href: "/reports",
  },
  {
    slug: "fcfMargin",
    name: "FCF Margin",
    description: "Free cash flow as percentage of revenue",
    formula: "Free Cash Flow / Total Revenue × 100",
    dependsOn: ["freeCashFlow", "totalRevenue"],
    category: "cash_flow",
    tier: "advanced",
    format: "percent",
    direction: "higher_better",
    icon: "Percent",
    color: "emerald",
    href: "/reports",
  },
  {
    slug: "ttmRevenue",
    name: "TTM Revenue",
    description: "Trailing twelve months revenue",
    formula: "Sum of last 12 months Total Revenue",
    dependsOn: ["totalRevenue"],
    category: "revenue",
    tier: "advanced",
    format: "currency",
    direction: "higher_better",
    icon: "Calendar",
    color: "blue",
    href: "/revenue",
  },

  // ── Deep Tier ────────────────────────────────────────────────────────────

  {
    slug: "arpu",
    name: "ARPU",
    description: "Average revenue per user (active users, not accounts)",
    formula: "MRR / Active Users",
    dependsOn: ["mrr"],
    category: "saas",
    tier: "deep",
    format: "currency",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "User",
    color: "violet",
    href: "/revenue",
  },
  {
    slug: "netChurnRate",
    name: "Net Churn Rate",
    description: "Net MRR churn accounting for expansion (can be negative = growth)",
    formula: "(Churned MRR - Expansion MRR) / Previous MRR × 100",
    dependsOn: ["churnedMrr", "expansionMrr", "mrr"],
    category: "retention",
    tier: "deep",
    format: "percent",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "TrendingDown",
    color: "red",
    href: "/revenue",
  },
  {
    slug: "hasNegativeChurn",
    name: "Negative Churn",
    description: "Whether expansion MRR exceeds churned MRR",
    formula: "1 if Net Churn Rate < 0, else 0",
    dependsOn: ["netChurnRate"],
    category: "retention",
    tier: "deep",
    format: "boolean",
    direction: "higher_better",
    requiresSaaS: true,
    icon: "CheckCircle",
    color: "emerald",
    href: "/revenue",
  },
  {
    slug: "burnProductivity",
    name: "Burn Productivity",
    description: "Gross profit growth per dollar of operating expense (6-month rolling)",
    formula: "(Recent 6mo Gross Profit - Prior 6mo Gross Profit) / Prior 6mo OpEx",
    dependsOn: ["grossProfit"],
    category: "efficiency",
    tier: "deep",
    format: "ratio",
    direction: "higher_better",
    icon: "Zap",
    color: "amber",
    href: "/expenses",
  },
  {
    slug: "workingCapital",
    name: "Working Capital",
    description: "Short-term liquidity — current assets minus current liabilities",
    formula: "Current Assets - Current Liabilities",
    dependsOn: [],
    category: "balance_sheet",
    tier: "deep",
    format: "currency",
    direction: "higher_better",
    icon: "Landmark",
    color: "blue",
    href: "/reports",
  },
  {
    slug: "customerRetentionCost",
    name: "Customer Retention Cost",
    description: "Average spend to retain each customer",
    formula: "Retention Spend / Total Customers",
    dependsOn: ["totalCustomers"],
    category: "saas",
    tier: "deep",
    format: "currency",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "HandCoins",
    color: "orange",
    href: "/expenses",
  },
  {
    slug: "downgradeMrr",
    name: "Downgrade MRR",
    description: "MRR lost from customers moving to lower plans",
    formula: "Sum of MRR decreases from plan downgrades",
    dependsOn: [],
    category: "saas",
    tier: "deep",
    format: "currency",
    direction: "lower_better",
    requiresSaaS: true,
    icon: "ArrowDown",
    color: "orange",
    href: "/revenue",
  },

  // ── Employer Benefits parent + 4 generic components (umbrella §1.4) ──────
  {
    slug: "totalEmployerBenefitsCost",
    name: "Total Employer Benefits",
    description:
      "Total non-salary employer cost across statutory, insurance, retirement, and other benefits",
    formula: "Sum of benefitsBreakdown components × salary across all headcount",
    dependsOn: [],
    category: "cash",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Heart",
    color: "rose",
    href: "/team",
    aiContext: { include: "both" },
  },
  {
    slug: "statutoryEmployerContributionsCost",
    name: "Statutory Employer Contributions",
    description:
      "Country-mandated employer contributions (e.g. FICA in US, NI in UK, EPF in IN, Super in AU)",
    formula:
      "Sum of statutoryEmployerContributionsCost × salary across all headcount",
    dependsOn: ["totalEmployerBenefitsCost"],
    parentMetricId: "totalEmployerBenefitsCost",
    category: "cash",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Landmark",
    color: "slate",
    href: "/team",
  },
  {
    slug: "insuranceBenefitsCost",
    name: "Insurance Benefits",
    description: "Health, dental, life, disability insurance costs",
    formula: "Sum of insuranceBenefitsCost × salary across all headcount",
    dependsOn: ["totalEmployerBenefitsCost"],
    parentMetricId: "totalEmployerBenefitsCost",
    category: "cash",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Shield",
    color: "emerald",
    href: "/team",
  },
  {
    slug: "retirementContributionsCost",
    name: "Retirement Contributions",
    description:
      "Employer-side retirement contributions (401k match, pension, EPF employer, etc.)",
    formula:
      "Sum of retirementContributionsCost × salary across all headcount",
    dependsOn: ["totalEmployerBenefitsCost"],
    parentMetricId: "totalEmployerBenefitsCost",
    category: "cash",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Coins",
    color: "amber",
    href: "/team",
  },
  {
    slug: "otherBenefitsCost",
    name: "Other Benefits",
    description: "Other employer-paid benefits (perks, allowances, training)",
    formula: "Sum of otherBenefitsCost × salary across all headcount",
    dependsOn: ["totalEmployerBenefitsCost"],
    parentMetricId: "totalEmployerBenefitsCost",
    category: "cash",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Gift",
    color: "indigo",
    href: "/team",
  },

  // ── Ownership / Cap-Table Metrics (Phase 2 D §1.4 D7) ───────────────────

  // Phase 2 D §1.4 D7: totalOwnership parent — umbrella for cap-table breakdown
  {
    slug: "totalOwnership",
    name: "Total Ownership",
    description: "Fully-diluted ownership breakdown across all share classes and instruments (common, preferred, SAFEs, option pool)",
    formula: "Common + Preferred + SAFE Overhang + Option Pool Overhang = 100%",
    dependsOn: [],
    category: "cash",
    tier: "advanced",
    format: "percent",
    direction: "neutral",
    icon: "PieChart",
    color: "violet",
    href: "/funding",
    aiContext: { include: "parent_only" },
  },
  {
    slug: "commonStockOwnership",
    name: "Common Stock Ownership",
    description: "Founder + employee common shares as a percentage of fully-diluted cap table",
    formula: "Common Shares / Total Fully-Diluted Shares × 100",
    dependsOn: ["totalOwnership"],
    parentMetricId: "totalOwnership",
    category: "cash",
    tier: "advanced",
    format: "percent",
    direction: "neutral",
    icon: "Users",
    color: "blue",
    href: "/funding",
    aiContext: { include: "both" },
  },
  {
    slug: "preferredStockOwnership",
    name: "Preferred Stock Ownership",
    description: "Investor preferred shares (all series) as a percentage of fully-diluted cap table",
    formula: "Preferred Shares / Total Fully-Diluted Shares × 100",
    dependsOn: ["totalOwnership"],
    parentMetricId: "totalOwnership",
    category: "cash",
    tier: "advanced",
    format: "percent",
    direction: "neutral",
    icon: "Star",
    color: "amber",
    href: "/funding",
    aiContext: { include: "both" },
  },
  {
    slug: "safeOverhang",
    name: "SAFE Overhang",
    description:
      "Dilution from unconverted SAFEs expressed as a percentage of fully-diluted cap table. Discount-only SAFEs with no valuation cap need a priced round to estimate conversion — until one exists the dilution is shown as unknown, not 0 (FAIL-2a / H2).",
    formula: "SAFE Converted Shares (at cap/discount) / Total Fully-Diluted Shares × 100",
    dependsOn: ["totalOwnership"],
    parentMetricId: "totalOwnership",
    category: "cash",
    tier: "deep",
    format: "percent",
    direction: "neutral",
    icon: "Shield",
    color: "indigo",
    href: "/funding",
    aiContext: { include: "both" },
  },
  {
    slug: "optionPoolOverhang",
    name: "Option Pool Overhang",
    description: "Unissued employee option pool as a percentage of fully-diluted cap table",
    formula: "Unissued Option Pool / Total Fully-Diluted Shares × 100",
    dependsOn: ["totalOwnership"],
    parentMetricId: "totalOwnership",
    category: "cash",
    tier: "advanced",
    format: "percent",
    direction: "neutral",
    icon: "Settings",
    color: "slate",
    href: "/funding",
    aiContext: { include: "both" },
  },

  // ── Interest Expense (Phase 2 D §1.4 D6) ────────────────────────────────

  // Phase 2 D §1.4 D6: interestExpense — operating cost surfaced separately from principal
  {
    slug: "interestExpense",
    name: "Interest Expense",
    description: "Monthly interest cost on debt facilities; treated as an operating expense (not principal repayment)",
    formula: "Sum of (Outstanding Principal × Monthly Rate) across all active debt rounds",
    dependsOn: [],
    category: "cash",
    tier: "advanced",
    format: "currency",
    direction: "lower_better",
    icon: "Percent",
    color: "rose",
    href: "/funding",
    aiContext: { include: "both" },
  },
];

// ── Lookup Helpers ───────────────────────────────────────────────────────────

const _bySlug = new Map<string, MetricDefinition>();
for (const m of METRIC_REGISTRY) {
  _bySlug.set(m.slug, m);
}

/** Look up a metric definition by its slug (key in ComputedMetrics). */
export function getMetricDef(slug: string): MetricDefinition | undefined {
  return _bySlug.get(slug);
}

/**
 * Return all metrics whose `parentMetricId` equals the given slug.
 * Accepts an optional explicit list for testability — defaults to
 * the global METRIC_REGISTRY.
 */
export function getMetricChildren(
  parentSlug: string,
  registry: MetricDefinition[] = METRIC_REGISTRY
): MetricDefinition[] {
  return registry.filter((m) => m.parentMetricId === parentSlug);
}

/**
 * Resolve the AI-context inclusion policy for a metric. Defaults to 'both'
 * when the metric does not explicitly declare `aiContext`.
 */
export function getMetricAiInclude(
  slug: string
): "parent_only" | "components_only" | "both" {
  return getMetricDef(slug)?.aiContext?.include ?? "both";
}

/** Get all metrics in a category. */
export function getMetricsByCategory(category: MetricCategory): MetricDefinition[] {
  return METRIC_REGISTRY.filter((m) => m.category === category);
}

/** Get all metrics in a tier. */
export function getMetricsByTier(tier: MetricTier): MetricDefinition[] {
  return METRIC_REGISTRY.filter((m) => m.tier === tier);
}

/** Get all metric categories with their metrics. */
export function getMetricCatalog(): Map<MetricCategory, MetricDefinition[]> {
  const catalog = new Map<MetricCategory, MetricDefinition[]>();
  for (const m of METRIC_REGISTRY) {
    const existing = catalog.get(m.category) ?? [];
    existing.push(m);
    catalog.set(m.category, existing);
  }
  return catalog;
}

/** Category display info for the UI. */
export const CATEGORY_META: Record<MetricCategory, { label: string; description: string }> = {
  revenue: { label: "Revenue", description: "Income and recurring revenue metrics" },
  cash: { label: "Cash", description: "Cash position, burn rate, and runway" },
  saas: { label: "SaaS", description: "Subscription-specific metrics (MRR, churn, LTV)" },
  profitability: { label: "Profitability", description: "Margins, EBITDA, and net income" },
  growth: { label: "Growth", description: "Revenue, MRR, and customer growth rates" },
  efficiency: { label: "Efficiency", description: "Burn multiple, Rule of 40, productivity" },
  retention: { label: "Retention", description: "Revenue and customer retention rates" },
  cash_flow: { label: "Cash Flow", description: "Free cash flow and operating cash metrics" },
  balance_sheet: { label: "Balance Sheet", description: "Working capital and asset metrics" },
  customer: { label: "Customers", description: "Customer counts and acquisition" },
  expense: { label: "Expenses", description: "Operating expenses by behavior (fixed, variable, percentage, one-time)" },
};

// ── Default Dashboard Layouts ────────────────────────────────────────────────

/** Default hero card slugs (the 4 main KPI cards). */
export const DEFAULT_HERO_CARDS: string[] = [
  "cashPosition",
  "netBurnRate",
  "cashRunwayMonths",
  "mrr",
];

/** Default secondary metrics shown in the Key Metrics card. */
export const DEFAULT_SECONDARY_METRICS: string[] = [
  "arr",
  "grossMarginPercent",
  "revenuePerEmployee",
  "ebitda",
  "ruleOf40",
  "burnMultiple",
];

/** Intelligence mode default — AI picks, but these are the baseline. */
export const INTELLIGENCE_DEFAULTS: string[] = [
  "cashPosition",
  "netBurnRate",
  "cashRunwayMonths",
  "mrr",
  "arr",
  "grossMarginPercent",
  "ruleOf40",
  "burnMultiple",
];

// ── Dependency Graph Builder ─────────────────────────────────────────────────

/**
 * Build a full dependency graph of all metrics in the registry.
 * Returns adjacency data suitable for visualization.
 */
export function buildMetricDependencyGraph(): {
  nodes: Array<{ id: string; name: string; category: MetricCategory; tier: MetricTier }>;
  edges: Array<{ from: string; to: string }>;
} {
  const nodes = METRIC_REGISTRY.map((m) => ({
    id: m.slug,
    name: m.name,
    category: m.category,
    tier: m.tier,
  }));

  const edges: Array<{ from: string; to: string }> = [];
  for (const m of METRIC_REGISTRY) {
    for (const dep of m.dependsOn) {
      edges.push({ from: m.slug, to: dep });
    }
  }

  return { nodes, edges };
}

/**
 * Get all dependencies for a metric (recursive — the full tree).
 */
export function getMetricDependencyTree(slug: string): string[] {
  const visited = new Set<string>();
  const queue = [slug];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const def = _bySlug.get(current);
    if (def) {
      for (const dep of def.dependsOn) {
        if (!visited.has(dep)) queue.push(dep);
      }
    }
  }

  visited.delete(slug); // Don't include self
  return Array.from(visited);
}

/**
 * Get all metrics that depend on this metric (reverse dependencies).
 */
export function getMetricDependents(slug: string): string[] {
  return METRIC_REGISTRY
    .filter((m) => m.dependsOn.includes(slug))
    .map((m) => m.slug);
}

/**
 * Get all metrics that transitively depend on the given metric.
 * Walks the reverse dependency graph (BFS).
 */
export function getTransitiveDependents(slug: string): string[] {
  const visited = new Set<string>();
  const queue = [slug];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const dep of getMetricDependents(current)) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  visited.delete(slug); // Don't include self
  return Array.from(visited);
}

/**
 * Maps data entity types to the base metrics they directly affect.
 * When a data entity changes, these metrics (and all their transitive
 * dependents) may produce stale insights.
 */
export const ENTITY_METRIC_IMPACT: Record<string, string[]> = {
  revenue:         ["mrr", "arr", "totalRevenue", "revenueGrowthPercent", "netNewMrr", "newMrr"],
  headcount:       ["headcount", "totalOpex", "burnRate", "headcountCost"],
  "forecast-lines": ["burnRate", "totalOpex", "totalRevenue"],
  funding:         ["cashPosition", "cashRunwayMonths", "netBurnRate", "interestExpense", "totalOwnership", "commonStockOwnership", "preferredStockOwnership", "safeOverhang", "optionPoolOverhang"],
  expenses:        ["burnRate", "totalOpex", "netBurnRate"],
  scenarios:       ["*"], // scenario change affects all metrics
  accounts:        ["totalOpex", "totalRevenue"],
  departments:     ["totalOpex", "headcountCost"],
};

/**
 * Given a data entity type (e.g. "revenue", "headcount"), returns all
 * metric slugs that could be affected — base metrics + transitive dependents.
 *
 * Returns `["*"]` for entity types that affect everything (e.g. scenarios).
 */
export function getAffectedMetricSlugs(entityType: string): string[] {
  const baseMetrics = ENTITY_METRIC_IMPACT[entityType];
  if (!baseMetrics) return [];
  if (baseMetrics.includes("*")) return ["*"];

  const affected = new Set<string>();
  for (const base of baseMetrics) {
    affected.add(base);
    for (const dep of getTransitiveDependents(base)) {
      affected.add(dep);
    }
  }

  return Array.from(affected);
}

/**
 * Extract the current value for a metric from ComputedMetrics.
 */
export function extractMetricValue(
  metrics: ComputedMetrics,
  slug: string,
  month: string
): number | undefined {
  const series = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug];
  if (!Array.isArray(series)) return undefined;
  return series.find((m) => m.month === month)?.value;
}

/**
 * Format a metric value according to its definition.
 */
export function formatMetricValue(value: number, format: MetricFormat): string {
  switch (format) {
    case "currency":
      // Currency-format metrics intentionally return raw numbers here; callers in
      // the web app route through formatCurrency(...) from @burnless/types. Engine
      // must stay currency-agnostic (umbrella §1.6).
      return value.toString();
    case "percent":
      return `${value.toFixed(1)}%`;
    case "months":
      if (value >= 999) return "\u221e";
      return `${Math.round(value)} mo`;
    case "ratio":
      return `${value.toFixed(2)}`;
    case "multiple":
      return `${value.toFixed(1)}x`;
    case "boolean":
      return value > 0 ? "Yes" : "No";
    case "number":
    default:
      return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
}

/**
 * Check whether a metric has meaningful data for a given month.
 * Returns false when the series doesn't exist, the month has no entry,
 * or the value is NaN/Infinity.
 */
export function isMetricDataAvailable(
  metrics: ComputedMetrics,
  slug: string,
  month: string,
): boolean {
  const series = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug];
  if (!Array.isArray(series) || series.length === 0) return false;
  const entry = series.find((m) => m.month === month);
  if (entry === undefined) return false;
  if (!Number.isFinite(entry.value)) return false;
  return true;
}

/**
 * Map of metric slugs → human-friendly hints explaining what data the user
 * needs to add before this metric becomes available.
 */
const DATA_REQUIREMENT_HINTS: Record<string, string> = {
  cashPosition: "Add a funding round to see cash position",
  netBurnRate: "Add expenses to calculate burn rate",
  cashRunwayMonths: "Add funding & expenses to calculate runway",
  mrr: "Add subscription revenue to see MRR",
  arr: "Add subscription revenue to see ARR",
  totalRevenue: "Add revenue streams to see total revenue",
  revenueRunRate: "Add revenue streams to calculate run rate",
  burnRate: "Add expenses to see gross burn",
  grossProfit: "Add revenue & expenses to see gross profit",
  grossMarginPercent: "Add revenue & expenses to see gross margin",
  netIncome: "Add revenue & expenses to see net income",
  operatingIncome: "Add revenue & expenses to see operating income",
  ebitda: "Add revenue & expenses to see EBITDA",
  ebitdaMargin: "Add revenue & expenses to see EBITDA margin",
  revenueGrowthRate: "Add revenue to track growth",
  revenuePerEmployee: "Add revenue & team members",
  burnMultiple: "Add revenue & expenses to calculate burn multiple",
  ruleOf40: "Add revenue & expenses to calculate Rule of 40",
  freeCashFlow: "Add revenue & expenses to see free cash flow",
  fcfMargin: "Add revenue & expenses to see FCF margin",
  // Phase 5.8 — NaN-gated dark metrics. Each ghosts (card shows this hint, not
  // a wrong 0) when its distinguishing input is absent; the hint names that
  // exact input so the founder knows what to add. See §5.2–§5.5 + review M2.
  cac: "Add acquisition/marketing spend to compute CAC",
  ltvCacRatio: "Add acquisition spend & LTV inputs to see the LTV:CAC ratio",
  cacPaybackMonths: "Add acquisition spend to see CAC payback months",
  magicNumber: "Add prior-period sales & marketing spend to compute the magic number",
  customerRetentionCost: "Add retention/customer-success spend to compute retention cost",
  arpu: "Add active users to compute ARPU",
  ltv: "Add a non-zero revenue churn rate to estimate LTV",
  workingCapital: "Add balance-sheet data (current assets & liabilities) to see working capital",
  interestExpense: "Add a debt-bearing funding round to see interest expense",
};

/**
 * Get a user-facing hint explaining what data is missing for a metric.
 * Falls back to a generic message if no specific hint is registered.
 */
export function getMetricMissingDataHint(slug: string): string {
  if (DATA_REQUIREMENT_HINTS[slug]) return DATA_REQUIREMENT_HINTS[slug];
  const def = _bySlug.get(slug);
  if (def?.requiresSaaS) return "Add subscription data to see this metric";
  if (def?.dependsOn.length) {
    const depNames = def.dependsOn
      .map((d) => _bySlug.get(d)?.name ?? d)
      .slice(0, 2)
      .join(" & ");
    return `Requires ${depNames}`;
  }
  return "More data needed";
}

/**
 * Formula chain fallback — when a metric can't be calculated, return its
 * direct dependencies that ARE available. This lets the UI show partial
 * information instead of just "data missing".
 *
 * Example: cashRunwayMonths depends on [cashPosition, netBurnRate].
 * If cashRunwayMonths is unavailable but netBurnRate is available,
 * returns [{ slug: "netBurnRate", def: MetricDefinition, value: 4200 }].
 */
export interface MetricFallback {
  slug: string;
  def: MetricDefinition;
  value: number;
}

export function getMetricFallbacks(
  slug: string,
  metrics: ComputedMetrics,
  month: string,
): MetricFallback[] {
  const def = _bySlug.get(slug);
  if (!def || def.dependsOn.length === 0) return [];

  const fallbacks: MetricFallback[] = [];
  for (const depSlug of def.dependsOn) {
    if (isMetricDataAvailable(metrics, depSlug, month)) {
      const depDef = _bySlug.get(depSlug);
      const val = extractMetricValue(metrics, depSlug, month);
      if (depDef && val !== undefined && Number.isFinite(val)) {
        fallbacks.push({ slug: depSlug, def: depDef, value: val });
      }
    }
  }
  return fallbacks;
}

/**
 * Evaluate a metric against its benchmark (if any).
 * Returns a signal: "good" | "warn" | "bad" | null.
 */
export function evaluateBenchmark(
  value: number,
  def: MetricDefinition
): "good" | "warn" | "bad" | null {
  if (!def.benchmark) return null;
  const { good, warn, direction } = def.benchmark;

  if (direction === "higher_better") {
    if (value >= good) return "good";
    if (value >= warn) return "warn";
    return "bad";
  } else {
    if (value <= good) return "good";
    if (value <= warn) return "warn";
    return "bad";
  }
}

// ── Hero Card Auto-Swap ──────────────────────────────────────────────────────

/**
 * Ordered list of metric slugs that can replace empty hero card slots.
 * Tried in order; the first one with available data wins.
 */
export const HERO_CARD_FALLBACK_ORDER: string[] = [
  "totalRevenue",
  "arr",
  "grossProfit",
  "ebitda",
  "burnRate",
  "revenueRunRate",
  "grossMarginPercent",
  "burnMultiple",
  "ruleOf40",
  "freeCashFlow",
];

export interface HeroSwapResult {
  /** The slug to actually display in this hero slot */
  displaySlug: string;
  /** The metric definition for the display slug */
  displayDef: MetricDefinition;
  /** If auto-swapped, the original slug that was replaced */
  replacedSlug: string | null;
  /** If auto-swapped, what data the user needs to add to restore the original */
  restoreHint: string | null;
}

/**
 * Given the default hero card slugs and data availability, compute which
 * metrics to actually display. Empty slots are filled from HERO_CARD_FALLBACK_ORDER.
 */
export function getHeroSwaps(
  heroSlugs: string[],
  metrics: ComputedMetrics,
  month: string,
): HeroSwapResult[] {
  const usedSlugs = new Set<string>();
  const results: HeroSwapResult[] = [];

  for (const slug of heroSlugs) {
    usedSlugs.add(slug);
    const def = _bySlug.get(slug);
    if (!def) continue;

    if (isMetricDataAvailable(metrics, slug, month)) {
      results.push({
        displaySlug: slug,
        displayDef: def,
        replacedSlug: null,
        restoreHint: null,
      });
    } else {
      // Find first available fallback not already used
      let swapped = false;
      for (const fallback of HERO_CARD_FALLBACK_ORDER) {
        if (usedSlugs.has(fallback)) continue;
        if (!isMetricDataAvailable(metrics, fallback, month)) continue;
        const fbDef = _bySlug.get(fallback);
        if (!fbDef) continue;

        usedSlugs.add(fallback);
        results.push({
          displaySlug: fallback,
          displayDef: fbDef,
          replacedSlug: slug,
          restoreHint: getMetricMissingDataHint(slug),
        });
        swapped = true;
        break;
      }

      // Second pass: try ALL metrics from the full registry
      if (!swapped) {
        for (const m of METRIC_REGISTRY) {
          if (usedSlugs.has(m.slug)) continue;
          if (!isMetricDataAvailable(metrics, m.slug, month)) continue;

          usedSlugs.add(m.slug);
          results.push({
            displaySlug: m.slug,
            displayDef: m,
            replacedSlug: slug,
            restoreHint: getMetricMissingDataHint(slug),
          });
          swapped = true;
          break;
        }
      }

      if (!swapped) {
        // No fallback available — keep the ghost card
        results.push({
          displaySlug: slug,
          displayDef: def,
          replacedSlug: null,
          restoreHint: null,
        });
      }
    }
  }

  return results;
}
