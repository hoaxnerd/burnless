import { NextResponse } from "next/server";
import { db, scenarios, getResolvedData } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeAllHeadcountCosts,
  compareScenarios,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type ScenarioData,
  type MonthlySeries,
  addSeries,
  subtractSeries,
  monthKey,
  D,
  dRound2,
} from "@burnless/engine";

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

  return NextResponse.json({
    baseScenario: result.baseScenario,
    compareScenario: result.compareScenario,
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
  // Resolve all entity types with scenario overlay (null = base data)
  const data = await getResolvedData(companyId, scenarioId);

  const forecastInputs: ForecastLineInput[] = data.forecastLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: fl.startDate,
    endDate: fl.endDate,
  }));
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  const revInputs: RevenueStreamInput[] = data.revenueStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  const hcInputs: HeadcountPlanInput[] = data.headcountPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    employeeType: "full_time",
    count: hp.count,
    salary: Number(hp.salary),
    hourlyRate: null,
    hoursPerWeek: null,
    startDate: hp.startDate,
    endDate: hp.endDate,
    benefitsRate: Number(hp.benefitsRate),
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  const accountMap = new Map(data.financialAccounts.map((a) => [a.id, a]));
  let totalRevenue = new Map(revenueValues);
  let totalCogs: MonthlySeries = new Map();
  let totalOpex: MonthlySeries = new Map();
  let totalOtherIncome: MonthlySeries = new Map();
  let totalOtherExpense: MonthlySeries = new Map();

  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    if (account.category === "revenue") totalRevenue = addSeries(totalRevenue, values);
    else if (account.category === "cogs") totalCogs = addSeries(totalCogs, values);
    else if (account.category === "operating_expense") totalOpex = addSeries(totalOpex, values);
    else if (account.category === "other_income") totalOtherIncome = addSeries(totalOtherIncome, values);
    else if (account.category === "other_expense") totalOtherExpense = addSeries(totalOtherExpense, values);
  }
  totalOpex = addSeries(totalOpex, headcountCosts.totalCost);
  const totalExpenses = addSeries(addSeries(totalCogs, totalOpex), totalOtherExpense);
  const netIncome = subtractSeries(addSeries(totalRevenue, totalOtherIncome), totalExpenses);

  // Cash position from resolved funding rounds
  const funding = data.fundingRounds;
  const startingCash = funding
    .filter((r) => !r.isProjected && new Date(r.date) < periodStart)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const futureFunding: MonthlySeries = new Map();
  for (const r of funding) {
    const rDate = new Date(r.date);
    if (r.isProjected || rDate >= periodStart) {
      const key = monthKey(rDate);
      futureFunding.set(key, (futureFunding.get(key) ?? 0) + Number(r.amount));
    }
  }
  const cashPosition: MonthlySeries = new Map();
  let runningCash = D(startingCash);
  for (const m of Array.from(netIncome.keys()).sort()) {
    runningCash = runningCash.plus(netIncome.get(m) ?? 0).plus(futureFunding.get(m) ?? 0);
    cashPosition.set(m, dRound2(runningCash));
  }

  return {
    id: scenarioId ?? "base",
    name,
    accounts: accountForecasts,
    aggregates: {
      revenue: totalRevenue,
      expenses: totalExpenses,
      netIncome,
      cashPosition,
      headcount: headcountCosts.headcount,
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
