import { NextResponse } from "next/server";
import { db, scenarios, getResolvedData } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { getTransactions, getForecastValues } from "@/lib/data";
import { computeFinancials } from "@/lib/compute-financials";
import { compareScenarios, type ScenarioData } from "@burnless/engine";

/**
 * GET /api/scenarios/compare?baseId=xxx&compareId=yyy[&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 *
 * Compares two scenarios by resolving base data + scenario overrides for each.
 * baseId can be "base" to compare against the current plan (no scenario overlay).
 */
export const GET = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "heavy");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const baseId = url.searchParams.get("baseId");
  const compareId = url.searchParams.get("compareId");

  if (!baseId || !compareId) return errorResponse("baseId and compareId required", 400);

  // Parse optional date range (default to current calendar year)
  const now = new Date();
  const startDateParam = url.searchParams.get("startDate");
  const endDateParam = url.searchParams.get("endDate");
  const periodStart = startDateParam ? new Date(startDateParam) : new Date(now.getFullYear(), 0, 1);
  const periodEnd = endDateParam ? new Date(endDateParam) : new Date(now.getFullYear(), 11, 1);

  // Validate parsed dates
  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    return errorResponse("Invalid startDate or endDate format", 400);
  }

  // Resolve left side: "base" means no scenario overlay
  const isBaseLeft = baseId === "base";

  // Validate scenarios exist (skip validation for "base" literal)
  const scenarioIds = [
    ...(isBaseLeft ? [] : [baseId]),
    compareId,
  ];

  const scenarioRecords = await Promise.all(
    scenarioIds.map((id) =>
      db
        .select()
        .from(scenarios)
        .where(
          and(
            eq(scenarios.id, id),
            eq(scenarios.companyId, ctx.companyId),
            isNull(scenarios.deletedAt),
          ),
        )
        .then((r) => r[0]),
    ),
  );

  // Check that all requested scenario records were found
  for (let i = 0; i < scenarioIds.length; i++) {
    if (!scenarioRecords[i]) return errorResponse("Scenario not found", 404);
  }

  const leftScenario = isBaseLeft
    ? null
    : scenarioRecords[0]!;
  const rightScenario = isBaseLeft
    ? scenarioRecords[0]!
    : scenarioRecords[1]!;

  // Build scenario data for both sides
  const [leftData, rightData] = await Promise.all([
    buildScenarioData(
      isBaseLeft ? null : leftScenario!.id,
      isBaseLeft ? "Base (current plan)" : leftScenario!.name,
      ctx.companyId,
      periodStart,
      periodEnd,
    ),
    buildScenarioData(
      rightScenario.id,
      rightScenario.name,
      ctx.companyId,
      periodStart,
      periodEnd,
    ),
  ]);

  const result = compareScenarios(leftData, rightData);

  // Build entity-level data diff
  const [leftResolved, rightResolved] = await Promise.all([
    getResolvedData(ctx.companyId, isBaseLeft ? null : leftScenario!.id),
    getResolvedData(ctx.companyId, rightScenario.id),
  ]);
  const dataDiff = buildDataDiff(leftResolved, rightResolved);

  // Wrap engine string-only scenario names into `{ id, name }` to match the
  // client-side ComparisonData contract (apps/web/.../comparison-types.ts).
  // Without this, every `data.baseScenario.name` lookup on the page reads
  // undefined and renders blank labels in the metric / charts / breakdown tabs.
  return NextResponse.json({
    baseScenario: {
      id: isBaseLeft ? "base" : leftScenario!.id,
      name: result.baseScenario,
    },
    compareScenario: {
      id: rightScenario.id,
      name: result.compareScenario,
    },
    lines: [
      { name: "Revenue", ...serializeComparison(result.revenue) },
      { name: "Expenses", ...serializeComparison(result.expenses) },
      { name: "Net Income", ...serializeComparison(result.netIncome) },
      { name: "Cash Position", ...serializeComparison(result.cashPosition) },
      { name: "Headcount", ...serializeComparison(result.headcount) },
    ],
    dataDiff,
  });
});

async function buildScenarioData(
  scenarioId: string | null,
  name: string,
  companyId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ScenarioData> {
  // Resolve all entity types with scenario overlay (null = base data), plus the
  // actuals + forecast-value overrides the shared compute needs.
  const data = await getResolvedData(companyId, scenarioId);
  const [transactions, forecastValues] = await Promise.all([
    getTransactions(companyId),
    getForecastValues(data.forecastLines.map((l) => l.id)),
  ]);

  // Route through the SAME compute the dashboard uses (computeFinancials), so a
  // scenario comparison reflects transaction actuals, Phase B carry-forward,
  // coversHeadcount reconciliation, and funding impact — never diverging from the
  // dashboard's revenue / expenses / net income / cash / headcount.
  const fin = computeFinancials({
    accounts: data.financialAccounts,
    forecastLines: data.forecastLines,
    forecastValues,
    revenueStreams: data.revenueStreams,
    headcountPlans: data.headcountPlans,
    fundingRounds: data.fundingRounds,
    transactions,
    periodStart,
    periodEnd,
  });

  return {
    id: scenarioId ?? "base",
    // Per-account series feed only compareScenarios' `accountComparisons`, which
    // this route does not serialize — the response uses the aggregates below.
    accounts: new Map(),
    name,
    aggregates: {
      revenue: fin.totalRevenue,
      expenses: fin.totalExpenses,
      netIncome: fin.netIncome,
      cashPosition: fin.cashPosition,
      headcount: fin.headcountSeries,
    },
  };
}

function serializeComparison(line: {
  baseValues: { month: string; value: number }[];
  compareValues: { month: string; value: number }[];
  deltaAbsolute: { month: string; value: number }[];
  deltaPercent: { month: string; value: number }[];
}) {
  return {
    baseValues: line.baseValues,
    compareValues: line.compareValues,
    deltaAbsolute: line.deltaAbsolute,
    deltaPercent: line.deltaPercent,
  };
}

/* ── Data Diff Builder ──────────────────────────────────────────────────── */

type ResolvedDataSet = Awaited<ReturnType<typeof getResolvedData>>;

interface DiffItem {
  id: string;
  entityId: string;
  action: "modify" | "create" | "delete";
  data: Record<string, unknown>;
  originalData?: Record<string, unknown>;
}

interface DiffGroup {
  entityType: string;
  items: DiffItem[];
}

interface DataDiff {
  summary: { modified: number; created: number; deleted: number; total: number };
  groups: DiffGroup[];
}

const ENTITY_TYPES = [
  { key: "revenueStreams" as const, type: "revenue_stream" },
  { key: "headcountPlans" as const, type: "headcount_plan" },
  { key: "forecastLines" as const, type: "forecast_line" },
  { key: "fundingRounds" as const, type: "funding_round" },
  { key: "departments" as const, type: "department" },
  { key: "financialAccounts" as const, type: "financial_account" },
];

function buildDataDiff(left: ResolvedDataSet, right: ResolvedDataSet): DataDiff {
  let modified = 0;
  let created = 0;
  let deleted = 0;
  const groups: DiffGroup[] = [];

  for (const { key, type } of ENTITY_TYPES) {
    const leftEntities = left[key] as Array<{ id: string; [k: string]: unknown }>;
    const rightEntities = right[key] as Array<{ id: string; [k: string]: unknown }>;

    const leftMap = new Map(leftEntities.map((e) => [e.id, e]));
    const rightMap = new Map(rightEntities.map((e) => [e.id, e]));

    const items: DiffItem[] = [];

    // Entities in right but not in left → created
    for (const [id, rightEntity] of rightMap) {
      if (!leftMap.has(id)) {
        items.push({
          id: `diff-${type}-${id}`,
          entityId: id,
          action: "create",
          data: stripInternal(rightEntity),
        });
        created++;
      }
    }

    // Entities in left but not in right → deleted
    for (const [id, leftEntity] of leftMap) {
      if (!rightMap.has(id)) {
        items.push({
          id: `diff-${type}-${id}`,
          entityId: id,
          action: "delete",
          data: stripInternal(leftEntity),
        });
        deleted++;
      }
    }

    // Entities in both → check if modified
    for (const [id, leftEntity] of leftMap) {
      const rightEntity = rightMap.get(id);
      if (!rightEntity) continue;

      const leftClean = stripInternal(leftEntity);
      const rightClean = stripInternal(rightEntity);

      if (JSON.stringify(leftClean) !== JSON.stringify(rightClean)) {
        items.push({
          id: `diff-${type}-${id}`,
          entityId: id,
          action: "modify",
          data: rightClean,
          originalData: leftClean,
        });
        modified++;
      }
    }

    if (items.length > 0) {
      groups.push({ entityType: type, items });
    }
  }

  return {
    summary: { modified, created, deleted, total: modified + created + deleted },
    groups,
  };
}

/** Strip internal fields like _override from diff comparison */
function stripInternal(entity: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key.startsWith("_")) continue;
    result[key] = value;
  }
  return result;
}
