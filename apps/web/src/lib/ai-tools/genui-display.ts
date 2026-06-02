/**
 * Server handlers for data-bound + presentational display tools.
 * Each handler returns JSON: { render: { component, props }, modelResult }.
 * Data-bound handlers compute REAL numbers via existing compute helpers.
 */
import { z } from "zod";
import {
  compareScenarios,
  monthKey,
  parseMonthKey,
  seriesToArray,
  sum,
  type ComparisonLine,
  type MonthlySeries,
  type ScenarioData,
} from "@burnless/engine";
import { getScenarioForCompany } from "@burnless/db";
import { chartColors } from "@/components/charts/chart-theme";
import { computeDashboardData } from "../compute-dashboard";
import { computeExpenseDetails } from "../compute-expenses";
import { computeRevenueDetails } from "../compute-revenue";
import { computeCapTableForCompany } from "../compute-cap-table";
import { getDefaultScenario, getFundingRounds } from "../data";
import { latest, requireCompanyId, type ToolHandler } from "./types";

export const genuiDisplaySchemas: Record<string, z.ZodType> = {};
export const genuiDisplayHandlers: Record<string, ToolHandler> = {};

/** Resolve the scenario id: explicit arg → context → company default. */
async function resolveScenarioId(
  ctx: { companyId: string; scenarioId?: string },
  given?: unknown
): Promise<string | null> {
  const sid = (typeof given === "string" && given) || ctx.scenarioId;
  if (sid) return sid;
  const def = await getDefaultScenario(ctx.companyId);
  return def?.id ?? null;
}

type FormatHint = "currency" | "number" | "percent";

/**
 * Metric key → ComputedMetrics field + display metadata. Keys match the engine
 * `ComputedMetrics` shape (metrics.ts): cashRunwayMonths, netBurnRate, … each a
 * MetricValue[] (latest entry is the current value).
 */
export const METRIC_SPECS: Record<
  string,
  { key: string; label: string; format: FormatHint; unit?: string }
> = {
  runway: { key: "cashRunwayMonths", label: "Runway", format: "number", unit: "months" },
  net_burn: { key: "netBurnRate", label: "Net burn", format: "currency" },
  mrr: { key: "mrr", label: "MRR", format: "currency" },
  arr: { key: "arr", label: "ARR", format: "currency" },
  cash: { key: "cashPosition", label: "Cash", format: "currency" },
  gross_margin: { key: "grossMarginPercent", label: "Gross margin", format: "percent" },
  ltv: { key: "ltv", label: "LTV", format: "currency" },
  cac: { key: "cac", label: "CAC", format: "currency" },
  ltv_cac: { key: "ltvCacRatio", label: "LTV:CAC", format: "number" },
  churn: { key: "customerChurnRate", label: "Churn", format: "percent" },
};

genuiDisplaySchemas.show_metric_card = z.object({
  metric: z.enum([
    "runway",
    "net_burn",
    "mrr",
    "arr",
    "cash",
    "gross_margin",
    "ltv",
    "cac",
    "ltv_cac",
    "churn",
  ]),
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_metric_card = async (input, context) => {
  const ctx = requireCompanyId(context);
  const metric = String(input.metric);
  const spec = METRIC_SPECS[metric];
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);
  if (!spec || !scenarioId) {
    return JSON.stringify({
      render: {
        component: "metric_card",
        props: { label: spec?.label ?? metric, value: null, format: spec?.format ?? "number" },
      },
      modelResult: `[metric_card: no data for ${metric}]`,
    });
  }
  const dash = await computeDashboardData(ctx.companyId, scenarioId);
  const series = (dash.metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[
    spec.key
  ];
  const value = latest(series);
  const props = { label: spec.label, value, format: spec.format, unit: spec.unit };
  return JSON.stringify({
    render: { component: "metric_card", props },
    modelResult: `[metric_card shown: ${spec.label} = ${value}]`,
  });
};

// ── show_kpi_grid ───────────────────────────────────────────────────────────

const KPI_METRIC_ENUM = [
  "runway",
  "net_burn",
  "mrr",
  "arr",
  "cash",
  "gross_margin",
  "ltv",
  "cac",
  "ltv_cac",
  "churn",
] as const;

genuiDisplaySchemas.show_kpi_grid = z.object({
  metrics: z.array(z.enum(KPI_METRIC_ENUM)).min(2).max(8),
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_kpi_grid = async (input, context) => {
  const ctx = requireCompanyId(context);
  const requested = Array.isArray(input.metrics)
    ? input.metrics.map((m) => String(m)).filter((m) => METRIC_SPECS[m])
    : [];
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const envelope = (items: Array<{ label: string; value: number | null; format: FormatHint; unit?: string }>) =>
    JSON.stringify({
      render: { component: "kpi_grid", props: { items } },
      modelResult: items.length
        ? `[kpi_grid shown: ${items.map((i) => i.label).join(", ")}]`
        : `[kpi_grid: no data]`,
    });

  if (!scenarioId || requested.length === 0) return envelope([]);

  const dash = await computeDashboardData(ctx.companyId, scenarioId);
  const metricsByKey = dash.metrics as unknown as Record<
    string,
    Array<{ month: string; value: number }>
  >;

  const items = requested.map((metric) => {
    const spec = METRIC_SPECS[metric]!;
    const value = latest(metricsByKey[spec.key]);
    const item: { label: string; value: number | null; format: FormatHint; unit?: string } = {
      label: spec.label,
      value,
      format: spec.format,
    };
    if (spec.unit) item.unit = spec.unit;
    return item;
  });

  return envelope(items);
};

// ── show_line_chart ─────────────────────────────────────────────────────────

type MetricArray = Array<{ month: string; value: number }>;
type DashboardLike = Record<string, unknown>;

/**
 * Each chartable series resolves to a `{ month, value }[]`. Sources differ:
 * "metric" reads a ComputedMetrics MetricValue[] field; "series" reads a
 * top-level MonthlySeries (Map) and flattens it via the engine helper.
 */
const LINE_SERIES_SPECS: Record<
  string,
  { kind: "metric" | "series"; key: string; label: string }
> = {
  revenue: { kind: "series", key: "totalRevenue", label: "Revenue" },
  cash: { kind: "series", key: "cashPosition", label: "Cash" },
  headcount_cost: { kind: "series", key: "headcountCostSeries", label: "Headcount cost" },
  mrr: { kind: "metric", key: "mrr", label: "MRR" },
  net_burn: { kind: "metric", key: "netBurnRate", label: "Net burn" },
};

genuiDisplaySchemas.show_line_chart = z.object({
  series: z.enum(["mrr", "revenue", "net_burn", "cash", "headcount_cost"]).optional(),
  months: z.number().int().min(1).max(36).optional(),
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_line_chart = async (input, context) => {
  const ctx = requireCompanyId(context);
  const series = typeof input.series === "string" ? input.series : "revenue";
  const months =
    typeof input.months === "number" && Number.isFinite(input.months)
      ? Math.min(36, Math.max(1, Math.floor(input.months)))
      : 12;
  const spec = LINE_SERIES_SPECS[series] ?? LINE_SERIES_SPECS.revenue!;
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const emptyEnvelope = JSON.stringify({
    render: {
      component: "line_chart",
      props: {
        title: spec.label,
        format: "currency",
        data: [],
        lines: [{ dataKey: "value", label: spec.label }],
      },
    },
    modelResult: `[line_chart: no data for ${series}]`,
  });
  if (!scenarioId) return emptyEnvelope;

  const dash = (await computeDashboardData(ctx.companyId, scenarioId)) as unknown as DashboardLike;
  let points: MetricArray;
  if (spec.kind === "metric") {
    points = ((dash.metrics as Record<string, MetricArray> | undefined)?.[spec.key] ?? []).map(
      (p) => ({ month: p.month, value: p.value })
    );
  } else {
    const map = dash[spec.key] as MonthlySeries | undefined;
    points = map ? seriesToArray(map) : [];
  }

  // Trim to the last `months` points (series are chronologically sorted).
  const data = points.slice(-months);

  return JSON.stringify({
    render: {
      component: "line_chart",
      props: {
        title: spec.label,
        format: "currency",
        data,
        lines: [{ dataKey: "value", label: spec.label }],
      },
    },
    modelResult: `[line_chart shown: ${spec.label}, ${data.length} months]`,
  });
};

// ── show_bar_chart ──────────────────────────────────────────────────────────

type CategoryDatum = { label: string; value: number };

/** RevenueByType field → human label, for the revenue_by_stream dimension. */
const REVENUE_TYPE_LABELS: Array<{ key: string; label: string }> = [
  { key: "subscriptionRevenue", label: "Subscription" },
  { key: "oneTimeRevenue", label: "One-time" },
  { key: "usageRevenue", label: "Usage" },
  { key: "servicesRevenue", label: "Services" },
  { key: "marketplaceRevenue", label: "Marketplace" },
  { key: "ecommerceRevenue", label: "E-commerce" },
  { key: "hardwareRevenue", label: "Hardware" },
];

const BAR_DIMENSIONS = {
  expense_by_category: "Expenses by category",
  revenue_by_stream: "Revenue by stream",
} as const;

genuiDisplaySchemas.show_bar_chart = z.object({
  dimension: z.enum(["expense_by_category", "revenue_by_stream"]).optional(),
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_bar_chart = async (input, context) => {
  const ctx = requireCompanyId(context);
  const dimension =
    input.dimension === "revenue_by_stream" ? "revenue_by_stream" : "expense_by_category";
  const title = BAR_DIMENSIONS[dimension];
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const envelope = (data: CategoryDatum[]) =>
    JSON.stringify({
      render: {
        component: "bar_chart",
        props: {
          title,
          format: "currency",
          data,
          bars: [{ dataKey: "value", label: "Amount", color: chartColors.brand }],
        },
      },
      modelResult: data.length
        ? `[bar_chart shown: ${title}, ${data.length} categories]`
        : `[bar_chart: no data for ${dimension}]`,
    });

  if (!scenarioId) return envelope([]);

  let data: CategoryDatum[] = [];
  if (dimension === "expense_by_category") {
    const details = await computeExpenseDetails(ctx.companyId, scenarioId);
    data = (details.subcategoryBreakdown ?? [])
      .map((b) => ({ label: b.subcategory, value: b.amount }))
      .filter((d) => d.value > 0);
  } else {
    const dash = await computeDashboardData(ctx.companyId, scenarioId);
    const byType = (dash as unknown as { revenueByType?: Record<string, MonthlySeries> })
      .revenueByType;
    data = REVENUE_TYPE_LABELS.map(({ key, label }) => {
      const series = byType?.[key];
      const total = series ? sum([...series.values()]) : 0;
      return { label, value: total };
    }).filter((d) => d.value > 0);
  }

  return envelope(data);
};

// ── show_burn_breakdown ─────────────────────────────────────────────────────

/**
 * Latest-month expense burn grouped by category. Reuses the `bar_chart`
 * renderer (component name is "bar_chart") — only the handler + tool def are
 * new. `subcategoryBreakdown.amount` is the current-month per-category spend
 * (computeExpenseDetails sums `currentAmount`), which is exactly the monthly
 * burn split the user asks for.
 */
genuiDisplaySchemas.show_burn_breakdown = z.object({
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_burn_breakdown = async (input, context) => {
  const ctx = requireCompanyId(context);
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);
  const title = "Burn breakdown";

  const envelope = (data: CategoryDatum[]) =>
    JSON.stringify({
      render: {
        component: "bar_chart",
        props: {
          title,
          format: "currency",
          data,
          bars: [{ dataKey: "value", label: "Monthly", color: chartColors.brand }],
        },
      },
      modelResult: data.length
        ? `[burn_breakdown shown: ${title}, ${data.length} categories]`
        : `[burn_breakdown: no expense data]`,
    });

  if (!scenarioId) return envelope([]);

  const details = await computeExpenseDetails(ctx.companyId, scenarioId);
  const data: CategoryDatum[] = (details.subcategoryBreakdown ?? [])
    .map((b) => ({ label: b.subcategory, value: b.amount }))
    .filter((d) => d.value > 0);

  return envelope(data);
};

// ── show_area_chart ─────────────────────────────────────────────────────────

/**
 * Area series both read a top-level MonthlySeries (Map) from the dashboard:
 *  - cash_runway      → cashPosition, shown as-is (balance over time).
 *  - cumulative_revenue → totalRevenue, transformed into a running sum.
 */
const AREA_SERIES_SPECS: Record<
  string,
  { key: string; label: string; cumulative: boolean }
> = {
  cash_runway: { key: "cashPosition", label: "Cash runway", cumulative: false },
  cumulative_revenue: { key: "totalRevenue", label: "Cumulative revenue", cumulative: true },
};

genuiDisplaySchemas.show_area_chart = z.object({
  series: z.enum(["cash_runway", "cumulative_revenue"]).optional(),
  months: z.number().int().min(1).max(36).optional(),
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_area_chart = async (input, context) => {
  const ctx = requireCompanyId(context);
  const series = input.series === "cumulative_revenue" ? "cumulative_revenue" : "cash_runway";
  const months =
    typeof input.months === "number" && Number.isFinite(input.months)
      ? Math.min(36, Math.max(1, Math.floor(input.months)))
      : 18;
  const spec = AREA_SERIES_SPECS[series]!;
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const envelope = (data: MetricArray) =>
    JSON.stringify({
      render: {
        component: "area_chart",
        props: { title: spec.label, format: "currency", data, color: chartColors.brand },
      },
      modelResult: data.length
        ? `[area_chart shown: ${spec.label}, ${data.length} months]`
        : `[area_chart: no data for ${series}]`,
    });

  if (!scenarioId) return envelope([]);

  const dash = (await computeDashboardData(ctx.companyId, scenarioId)) as unknown as DashboardLike;
  const map = dash[spec.key] as MonthlySeries | undefined;
  // seriesToArray returns chronologically-sorted {month, value}[].
  let points: MetricArray = map ? seriesToArray(map) : [];

  if (spec.cumulative) {
    let running = 0;
    points = points.map((p) => {
      running += p.value;
      return { month: p.month, value: running };
    });
  }

  // Trim to the last `months` points (series are chronologically sorted).
  const data = points.slice(-months);
  return envelope(data);
};

// ── show_runway ─────────────────────────────────────────────────────────────

/**
 * Derive the projected cash-out month: the latest cash month plus `ceil(runway)`
 * months. Returns null when either input is missing/non-finite. Uses the engine
 * month helpers so the offset stays calendar-correct.
 */
function deriveZeroCashMonth(
  latestCashMonth: string | null,
  runwayMonths: number | null
): string | null {
  if (!latestCashMonth || runwayMonths === null || !Number.isFinite(runwayMonths)) return null;
  const offset = Math.max(0, Math.ceil(runwayMonths));
  const d = parseMonthKey(latestCashMonth);
  d.setMonth(d.getMonth() + offset);
  return monthKey(d);
}

genuiDisplaySchemas.show_runway = z.object({
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_runway = async (input, context) => {
  const ctx = requireCompanyId(context);
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const envelope = (props: {
    runwayMonths: number | null;
    netBurn: number | null;
    cash: number | null;
    zeroCashMonth: string | null;
  }) =>
    JSON.stringify({
      render: { component: "runway", props: { ...props, format: "currency" as FormatHint } },
      modelResult:
        props.runwayMonths === null
          ? `[runway: no data]`
          : `[runway shown: ${props.runwayMonths} months, cash-out ${props.zeroCashMonth ?? "n/a"}]`,
    });

  if (!scenarioId) {
    return envelope({ runwayMonths: null, netBurn: null, cash: null, zeroCashMonth: null });
  }

  const dash = (await computeDashboardData(ctx.companyId, scenarioId)) as unknown as DashboardLike;
  const metrics = dash.metrics as Record<string, MetricArray> | undefined;
  const runwayMonths = latest(metrics?.cashRunwayMonths);
  const netBurn = latest(metrics?.netBurnRate);

  const cashMap = dash.cashPosition as MonthlySeries | undefined;
  const cashPoints = cashMap ? seriesToArray(cashMap) : [];
  const latestCash = cashPoints.length ? cashPoints[cashPoints.length - 1]! : null;
  const cash = latestCash ? latestCash.value : null;
  const zeroCashMonth = deriveZeroCashMonth(latestCash?.month ?? null, runwayMonths);

  return envelope({ runwayMonths, netBurn, cash, zeroCashMonth });
};

// ── show_cap_table ──────────────────────────────────────────────────────────

type CapTableRowProps = {
  holder: string;
  shares: number;
  pctOwnership: number; // 0-100 (engine emits 0-1; mapped here for the percent fmt)
  shareClass: string;
};

genuiDisplaySchemas.show_cap_table = z.object({
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_cap_table = async (input, context) => {
  const ctx = requireCompanyId(context);
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const envelope = (rows: CapTableRowProps[], totalShares: number) =>
    JSON.stringify({
      render: { component: "cap_table", props: { rows, totalShares } },
      modelResult: rows.length
        ? `[cap_table shown: ${rows.length} holders, ${totalShares} fully-diluted shares]`
        : `[cap_table: no data]`,
    });

  // computeCapTableForCompany accepts a nullable scenarioId (null ⇒ base).
  const capTable = await computeCapTableForCompany(ctx.companyId, scenarioId);
  const rows: CapTableRowProps[] = capTable.rows.map((r) => ({
    holder: r.holder,
    shares: r.shares,
    // Engine emits ownershipPercent on a 0-1 fully-diluted basis; the percent
    // format hint expects 0-100.
    pctOwnership: r.ownershipPercent * 100,
    shareClass: r.shareClass,
  }));

  return envelope(rows, capTable.totalFullyDiluted);
};

// ── show_scenario_diff ──────────────────────────────────────────────────────

/**
 * Wrap a dashboard's aggregate MonthlySeries into the engine `ScenarioData`
 * shape so `compareScenarios` can diff two scenarios with the same math the
 * /scenarios/compare route uses. Only aggregates matter here (no account-level
 * detail), so `accounts` is left empty.
 */
function dashboardToScenarioData(
  id: string,
  name: string,
  dash: Record<string, unknown>
): ScenarioData {
  const series = (key: string): MonthlySeries =>
    (dash[key] as MonthlySeries | undefined) ?? new Map();
  return {
    id,
    name,
    accounts: new Map(),
    aggregates: {
      revenue: series("totalRevenue"),
      expenses: series("totalExpenses"),
      netIncome: series("netIncome"),
      cashPosition: series("cashPosition"),
      headcount: series("headcountSeries"),
    },
  };
}

/** Latest-month value of a comparison side, or null when the series is empty. */
function latestComparisonValue(
  side: ComparisonLine["baseValues"]
): number | null {
  return side.length ? side[side.length - 1]!.value : null;
}

type ScenarioDiffRow = {
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  format: FormatHint;
};

/** Diff lines surfaced in the table, with their display format. */
const SCENARIO_DIFF_LINES: Array<{
  key: keyof Pick<
    import("@burnless/engine").ScenarioComparison,
    "revenue" | "expenses" | "netIncome" | "cashPosition" | "headcount"
  >;
  label: string;
  format: FormatHint;
}> = [
  { key: "revenue", label: "Revenue", format: "currency" },
  { key: "expenses", label: "Expenses", format: "currency" },
  { key: "netIncome", label: "Net income", format: "currency" },
  { key: "cashPosition", label: "Cash", format: "currency" },
  { key: "headcount", label: "Headcount", format: "number" },
];

genuiDisplaySchemas.show_scenario_diff = z.object({
  scenarioA: z.string(),
  scenarioB: z.string(),
});

genuiDisplayHandlers.show_scenario_diff = async (input, context) => {
  const ctx = requireCompanyId(context);
  const scenarioA = typeof input.scenarioA === "string" ? input.scenarioA : "";
  const scenarioB = typeof input.scenarioB === "string" ? input.scenarioB : "";

  const envelope = (
    aName: string,
    bName: string,
    rows: ScenarioDiffRow[]
  ) =>
    JSON.stringify({
      render: { component: "scenario_diff", props: { aName, bName, rows } },
      modelResult: rows.length
        ? `[scenario_diff shown: ${aName} vs ${bName}, ${rows.length} metrics]`
        : `[scenario_diff: no data]`,
    });

  if (!scenarioA || !scenarioB) return envelope("", "", []);

  // Verify both scenarios belong to the company before computing.
  const [recA, recB] = await Promise.all([
    getScenarioForCompany(scenarioA, ctx.companyId),
    getScenarioForCompany(scenarioB, ctx.companyId),
  ]);
  if (!recA || !recB) {
    return envelope(recA?.name ?? "Scenario A", recB?.name ?? "Scenario B", []);
  }

  const [dashA, dashB] = await Promise.all([
    computeDashboardData(ctx.companyId, scenarioA) as unknown as Promise<DashboardLike>,
    computeDashboardData(ctx.companyId, scenarioB) as unknown as Promise<DashboardLike>,
  ]);

  // Reuse the engine diff (same math the /scenarios/compare route runs).
  const comparison = compareScenarios(
    dashboardToScenarioData(recA.id, recA.name, dashA),
    dashboardToScenarioData(recB.id, recB.name, dashB)
  );

  const rows: ScenarioDiffRow[] = SCENARIO_DIFF_LINES.map(({ key, label, format }) => {
    const line = comparison[key];
    const a = latestComparisonValue(line.baseValues);
    const b = latestComparisonValue(line.compareValues);
    const delta =
      a !== null && b !== null ? Math.round((b - a) * 100) / 100 : null;
    return { label, a, b, delta, format };
  });

  return envelope(recA.name, recB.name, rows);
};

// ── show_funding_summary ────────────────────────────────────────────────────

type FundingRoundProps = {
  name: string;
  type: string;
  amount: number;
  date: string; // YYYY-MM-DD (serializable)
  isProjected: boolean;
};

/** Coerce a numeric/string amount to a finite number, defaulting to 0. */
function toAmount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Serialize a Date (or ISO/date string) to a YYYY-MM-DD day key. */
function toDateKey(raw: unknown): string {
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

genuiDisplaySchemas.show_funding_summary = z.object({
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_funding_summary = async (input, context) => {
  const ctx = requireCompanyId(context);
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const envelope = (rounds: FundingRoundProps[], totalRaised: number) =>
    JSON.stringify({
      render: {
        component: "funding_summary",
        props: { rounds, totalRaised, format: "currency" as FormatHint },
      },
      modelResult: rounds.length
        ? `[funding_summary shown: ${rounds.length} rounds, ${totalRaised} total raised]`
        : `[funding_summary: no funding rounds]`,
    });

  if (!scenarioId) return envelope([], 0);

  // Scenario-aware list of rounds (overrides merged when scenarioId is set).
  const raw = await getFundingRounds(ctx.companyId, scenarioId);
  const rounds: FundingRoundProps[] = raw
    .map((r) => ({
      name: String(r.name),
      type: String(r.type),
      amount: toAmount(r.amount),
      date: toDateKey(r.date),
      isProjected: Boolean(r.isProjected),
    }))
    // Chronological order (oldest → newest) for a top-down timeline.
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalRaised = rounds.reduce((s, r) => s + r.amount, 0);
  return envelope(rounds, totalRaised);
};

// ── show_data_table ─────────────────────────────────────────────────────────

type TableColumn = { key: string; label: string; format?: FormatHint };
type TableRow = Record<string, unknown>;

/** Latest-month value of a StatementLineItem-style values array, or null. */
function latestStatementValue(
  values: Array<{ month: string; value: number }> | undefined
): number | null {
  return latest(values);
}

const DATA_TABLE_TITLES = {
  pl_summary: "P&L summary",
  revenue_streams: "Revenue streams",
  expenses: "Expenses",
} as const;

genuiDisplaySchemas.show_data_table = z.object({
  dataset: z.enum(["pl_summary", "revenue_streams", "expenses"]).optional(),
  scenarioId: z.string().optional(),
});

genuiDisplayHandlers.show_data_table = async (input, context) => {
  const ctx = requireCompanyId(context);
  const dataset =
    input.dataset === "revenue_streams" || input.dataset === "expenses"
      ? input.dataset
      : "pl_summary";
  const title = DATA_TABLE_TITLES[dataset];
  const scenarioId = await resolveScenarioId(ctx, input.scenarioId);

  const envelope = (columns: TableColumn[], rows: TableRow[]) =>
    JSON.stringify({
      render: { component: "data_table", props: { title, columns, rows } },
      modelResult: rows.length
        ? `[data_table shown: ${title}, ${rows.length} rows]`
        : `[data_table: no data for ${dataset}]`,
    });

  if (!scenarioId) return envelope([], []);

  if (dataset === "revenue_streams") {
    const details = await computeRevenueDetails(ctx.companyId, scenarioId);
    const columns: TableColumn[] = [
      { key: "name", label: "Stream" },
      { key: "type", label: "Type" },
      { key: "amount", label: "Monthly revenue", format: "currency" },
    ];
    const rows: TableRow[] = (details.streamBreakdown ?? []).map((s) => ({
      name: s.name,
      type: s.type,
      amount: s.currentRevenue,
    }));
    return envelope(columns, rows);
  }

  if (dataset === "expenses") {
    const details = await computeExpenseDetails(ctx.companyId, scenarioId);
    const columns: TableColumn[] = [
      { key: "category", label: "Category" },
      { key: "amount", label: "Monthly cost", format: "currency" },
      { key: "share", label: "Share", format: "percent" },
    ];
    const rows: TableRow[] = (details.subcategoryBreakdown ?? []).map((b) => ({
      category: b.subcategory,
      amount: b.amount,
      share: b.percentage,
    }));
    return envelope(columns, rows);
  }

  // pl_summary: latest-month value of each P&L statement line.
  const dash = (await computeDashboardData(ctx.companyId, scenarioId)) as unknown as {
    profitAndLoss?: Record<string, { name: string; values?: Array<{ month: string; value: number }> }>;
  };
  const pl = dash.profitAndLoss;
  const columns: TableColumn[] = [
    { key: "line", label: "Line item" },
    { key: "amount", label: "Amount", format: "currency" },
  ];
  const PL_LINES = [
    "revenue",
    "cogs",
    "grossProfit",
    "operatingExpenses",
    "operatingIncome",
    "otherIncome",
    "otherExpenses",
    "netIncome",
  ];
  const rows: TableRow[] = [];
  if (pl) {
    for (const key of PL_LINES) {
      const item = pl[key];
      if (!item) continue;
      const amount = latestStatementValue(item.values);
      if (amount === null) continue;
      rows.push({ line: item.name, amount });
    }
  }

  return envelope(columns, rows);
};
