/**
 * Server handlers for data-bound + presentational display tools.
 * Each handler returns JSON: { render: { component, props }, modelResult }.
 * Data-bound handlers compute REAL numbers via existing compute helpers.
 */
import { z } from "zod";
import { computeDashboardData } from "../compute-dashboard";
import { getDefaultScenario } from "../data";
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
