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
  type ComparisonLine,
  type MonthlySeries,
  type ScenarioData,
} from "@burnless/engine";
import { getScenarioForCompany } from "@burnless/db";
import { chartColors } from "@/components/charts/chart-theme";
import { buildRevenueBreakdown } from "../breakdowns";
import { computeDashboardData } from "../compute-dashboard";
import { computeExpenseDetails } from "../compute-expenses";
import { computeRevenueDetails } from "../compute-revenue";
// Use the UNCACHED inner compute: the cached computeCapTableForCompany wraps
// unstable_cache, whose inner getCompany()/headers() throws inside the SSE stream.
import { computeCapTableInner } from "../compute-cap-table";
import { getDefaultScenario, getFundingRounds } from "../data";
import { latest, requireCompanyId, type ToolHandler } from "./types";

export const genuiDisplaySchemas: Record<string, z.ZodType> = {};
export const genuiDisplayHandlers: Record<string, ToolHandler> = {};

/** Resolve the scenario id: active chat scenario → explicit arg → company default. */
async function resolveScenarioId(
  ctx: { companyId: string; scenarioId?: string | null },
  given?: unknown
): Promise<string | null> {
  // Single-source rule: data-bound display tools must render the chat's ACTIVE
  // scenario, never a model-chosen one, or the component diverges from the AI text.
  // (show_scenario_diff is the deliberate exception — it takes explicit
  // scenarioA/scenarioB and does not use this resolver.)
  if (ctx.scenarioId) return ctx.scenarioId;
  if (typeof given === "string" && given) return given;
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
        ? `[kpi_grid shown] ${items.map((i) => `${i.label}=${i.value ?? "n/a"}`).join(", ")}`
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
    modelResult: data.length
      ? `[line_chart shown] ${spec.label}: ${data.length} months, latest ${data[data.length - 1]!.value}, range ${Math.min(...data.map((d) => d.value))}–${Math.max(...data.map((d) => d.value))}`
      : `[line_chart shown: ${spec.label}, 0 months]`,
  });
};

// ── show_bar_chart ──────────────────────────────────────────────────────────

type CategoryDatum = { label: string; value: number };

/**
 * Raw stream `type` (and the residual's "imported") → human label, for the
 * revenue_by_stream dimension. Keyed by the `type` values carried on the blended
 * `revenueLines` / the residual row (buildRevenueBreakdown), NOT by RevenueByType
 * field names — so the per-type bars read the same reconciled source as the AI text.
 */
const REVENUE_TYPE_LABEL: Record<string, string> = {
  subscription: "Subscription",
  one_time: "One-time",
  usage_based: "Usage",
  services: "Services",
  marketplace: "Marketplace",
  ecommerce: "E-commerce",
  hardware: "Hardware",
  imported: "Imported / Other",
};

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
        ? `[bar_chart shown] ${title}, ${data.length} categories: ${data
            .slice(0, 5)
            .map((d) => `${d.label}=${d.value}`)
            .join(", ")}`
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
    // Blended, reconciled per-stream breakdown at the CURRENT month, grouped by
    // revenue TYPE (keeping the per-type bar semantics) with the imported residual
    // as its own bar. Σ bars === totalRevenue at the current month (reconciles).
    const dash = await computeDashboardData(ctx.companyId, scenarioId);
    const total = dash.totalRevenue.get(dash.currentMonth) ?? 0;
    const rows = buildRevenueBreakdown(
      dash.revenueLines,
      dash.revenueResidual,
      dash.currentMonth,
      total
    );
    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + r.amount);
    data = Array.from(byType, ([type, value]) => ({
      label: REVENUE_TYPE_LABEL[type] ?? type,
      value,
    }))
      .filter((d) => d.value !== 0)
      .sort((a, b) => b.value - a.value);
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
        ? `[burn_breakdown shown] ${title}, total ${data.reduce(
            (s, d) => s + d.value,
            0
          )}/mo across ${data.length} categories: ${data
            .slice(0, 5)
            .map((d) => `${d.label}=${d.value}`)
            .join(", ")}`
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
        ? `[area_chart shown] ${spec.label}: ${data.length} months, latest ${data[data.length - 1]!.value}, range ${Math.min(
            ...data.map((d) => d.value)
          )}–${Math.max(...data.map((d) => d.value))}`
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
          : `[runway shown] runway ${props.runwayMonths} months · cash ${props.cash ?? "n/a"} · net burn ${props.netBurn ?? "n/a"}/mo · cash-out ${props.zeroCashMonth ?? "n/a"}`,
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
        ? `[cap_table shown] ${rows.length} holders, ${totalShares} fully-diluted shares; ${rows
            .slice(0, 5)
            .map((r) => `${r.holder}=${Math.round(r.pctOwnership * 10) / 10}%`)
            .join(", ")}`
        : `[cap_table: no data]`,
    });

  // computeCapTableInner accepts a nullable scenarioId (null ⇒ base).
  const capTable = await computeCapTableInner(ctx.companyId, scenarioId);
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
        ? `[scenario_diff shown] ${aName} vs ${bName}: ${rows
            .map((r) => `${r.label} ${r.a ?? "n/a"}→${r.b ?? "n/a"} (Δ${r.delta ?? "n/a"})`)
            .join(", ")}`
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
        ? `[funding_summary shown] ${rounds.length} rounds, ${totalRaised} total raised: ${rounds
            .map((r) => `${r.name}=${r.amount}`)
            .join(", ")}`
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
        ? `[data_table shown] ${title}, ${rows.length} rows; columns: ${columns
            .map((c) => c.label)
            .join(", ")}; ${rows
            .slice(0, 8)
            .map((row) => columns.map((c) => `${row[c.key] ?? ""}`).join(" "))
            .join(" | ")}`
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

// ── Presentational tools (Plan 3) ────────────────────────────────────────────
// These author model-supplied content. Pure validate-and-echo: no DB, no
// compute. They keep the (input, context) signature to satisfy ToolHandler but
// ignore context.

// ── show_callout ─────────────────────────────────────────────────────────────

genuiDisplaySchemas.show_callout = z.object({
  severity: z.enum(["info", "success", "warning", "critical"]),
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(800),
});

genuiDisplayHandlers.show_callout = async (input) => {
  const p = {
    severity: input.severity,
    title: input.title ?? null,
    body: input.body,
  };
  return JSON.stringify({
    render: { component: "callout", props: p },
    modelResult: `[callout shown: ${input.severity}]`,
  });
};

// ── show_comparison_table ─────────────────────────────────────────────────────

genuiDisplaySchemas.show_comparison_table = z.object({
  title: z.string().max(120).optional(),
  columns: z
    .array(z.object({ key: z.string().min(1).max(60), label: z.string().min(1).max(120) }))
    .min(2)
    .max(6),
  // Rows are objects keyed by column key; cell values are model-authored strings.
  rows: z.array(z.record(z.string())).min(1).max(20),
});

genuiDisplayHandlers.show_comparison_table = async (input) => {
  const columns = Array.isArray(input.columns) ? input.columns : [];
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const p = {
    title: typeof input.title === "string" ? input.title : null,
    columns,
    rows,
  };
  return JSON.stringify({
    render: { component: "comparison_table", props: p },
    modelResult: `[comparison_table shown: ${columns.length} columns, ${rows.length} rows]`,
  });
};

// ── show_checklist ─────────────────────────────────────────────────────────────

genuiDisplaySchemas.show_checklist = z.object({
  title: z.string().max(120).optional(),
  items: z
    .array(
      z.object({
        text: z.string().min(1).max(300),
        checked: z.boolean().optional(),
      })
    )
    .min(1)
    .max(20),
});

genuiDisplayHandlers.show_checklist = async (input) => {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  // Normalize each item: every item carries an explicit boolean `checked`.
  const items = rawItems.map((it) => {
    const r = (it ?? {}) as Record<string, unknown>;
    return {
      text: typeof r.text === "string" ? r.text : String(r.text ?? ""),
      checked: r.checked === true,
    };
  });
  const p = {
    title: typeof input.title === "string" ? input.title : null,
    items,
  };
  return JSON.stringify({
    render: { component: "checklist", props: p },
    modelResult: `[checklist shown: ${items.length} items]`,
  });
};

// ── show_suggested_actions (interactive) ──────────────────────────────────────
// The renderer wires each button's onClick to the dispatcher `onAction`, which
// sends `prompt` as a new chat turn. Handler is pure echo (no DB, no compute).

genuiDisplaySchemas.show_suggested_actions = z.object({
  actions: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        prompt: z.string().min(1).max(600),
      })
    )
    .min(1)
    .max(5),
});

genuiDisplayHandlers.show_suggested_actions = async (input) => {
  const rawActions = Array.isArray(input.actions) ? input.actions : [];
  const actions = rawActions.map((a) => {
    const r = (a ?? {}) as Record<string, unknown>;
    return {
      label: typeof r.label === "string" ? r.label : String(r.label ?? ""),
      prompt: typeof r.prompt === "string" ? r.prompt : String(r.prompt ?? ""),
    };
  });
  const p = { actions };
  return JSON.stringify({
    render: { component: "suggested_actions", props: p },
    modelResult: `[suggested_actions shown: ${actions.length} actions]`,
  });
};

// ── show_progress_steps ───────────────────────────────────────────────────────
// A model-authored vertical stepper. Pure echo (no DB, no compute).

genuiDisplaySchemas.show_progress_steps = z.object({
  steps: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        status: z.enum(["done", "active", "pending"]),
      })
    )
    .min(1)
    .max(12),
});

genuiDisplayHandlers.show_progress_steps = async (input) => {
  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  const steps = rawSteps.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>;
    const status =
      r.status === "done" || r.status === "active" || r.status === "pending"
        ? r.status
        : "pending";
    return {
      label: typeof r.label === "string" ? r.label : String(r.label ?? ""),
      status,
    };
  });
  const p = { steps };
  return JSON.stringify({
    render: { component: "progress_steps", props: p },
    modelResult: `[progress_steps shown: ${steps.length} steps]`,
  });
};
