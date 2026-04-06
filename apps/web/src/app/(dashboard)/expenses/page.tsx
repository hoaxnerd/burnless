export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getActiveScenario, getAccounts } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { computeExpenseDetails } from "@/lib/compute-expenses";
import { seriesToArray, monthKey, METRIC_REGISTRY } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { formatCurrency } from "@burnless/types";
import { ExpensesView } from "./expenses-view";
import { AddExpenseForm } from "./add-expense-form";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { ExpensesEmptyState } from "@/components/ui/empty-state";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  if (!company) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">Set up your company first</h3>
        <p className="text-sm text-surface-500">Complete onboarding to start tracking expenses.</p>
      </div>
    );
  }

  const scenario = await getActiveScenario(company.id, params.scenarioId);
  if (!scenario) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">Create a scenario first</h3>
        <p className="text-sm text-surface-500">You need a financial scenario to track expenses.</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <ExpensesContent companyId={company.id} scenarioId={scenario.id} />
    </Suspense>
  );
}

async function ExpensesContent({ companyId, scenarioId }: { companyId: string; scenarioId: string }) {
  const [data, accounts, expenseDetails] = await Promise.all([
    computeDashboardData(companyId, scenarioId),
    getAccounts(companyId),
    computeExpenseDetails(companyId, scenarioId),
  ]);

  // Show empty state if no expense data exists
  if (expenseDetails.lineItems.length === 0) {
    return (
      <div>
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Expenses</h1>
            <p className="mt-1 text-sm text-surface-500">
              Intelligent spend management &mdash; AI categorized, anomaly tracked, fully searchable
            </p>
          </div>
          <AddExpenseForm
            scenarioId={scenarioId}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, category: a.category }))}
          />
        </div>
        <ExpensesEmptyState />
      </div>
    );
  }

  const { currentMonth, totalExpenses, totalOpex, totalCogs } = data;
  const totalExpenseAmount = totalExpenses.get(currentMonth) ?? 0;
  const opexAmount = totalOpex.get(currentMonth) ?? 0;
  const cogsAmount = totalCogs.get(currentMonth) ?? 0;
  const personnelCost = data.headcountCostSeries.get(currentMonth) ?? 0;

  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevTotal = totalExpenses.get(prevMonth) ?? 0;
  const changePercent = prevTotal > 0 ? ((totalExpenseAmount - prevTotal) / prevTotal * 100) : null;

  // Budget vs actuals — the overlay model has no separate "budget" scenario
  const budgetTimeline: { month: string; value: number }[] | null = null;

  // Summary metrics
  const { anomalyCount, recurringCount } = expenseDetails;
  const summaryMetrics = {
    totalMonthly: totalExpenseAmount,
    changePercent: changePercent ? Number(changePercent) : null,
    personnelCost,
    personnelPercent: totalExpenseAmount > 0 ? (personnelCost / totalExpenseAmount * 100) : 0,
    opexAmount: Math.max(0, opexAmount - personnelCost),
    cogsAmount,
    anomalyCount,
    recurringCount,
  };

  // Build resolved slot data for ALL engine metrics (swap targets)
  const allEngineSlots: ResolvedSlotData[] = METRIC_REGISTRY.map((def) =>
    buildSlotMetricCard(def.slug, data.metrics, currentMonth, prevMonth)
  );

  // Timeline data (needed for sparklines)
  const expenseTimeline = seriesToArray(totalExpenses);
  const spark = (series: { month: string; value: number }[]) => {
    const vals = series.slice(-8).map(t => t.value);
    return vals.length >= 2 ? vals : undefined;
  };

  // Build page-specific default cards as ResolvedSlotData
  const pageDefaultSlots: ResolvedSlotData[] = [
    {
      slotId: "metric-0",
      content: { type: "metric", slug: "totalMonthly" },
      label: "Total Monthly",
      value: formatCurrency(totalExpenseAmount, "USD", undefined, { compact: true }),
      change: changePercent !== null ? `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}%` : undefined,
      changeLabel: changePercent !== null ? "vs last month" : undefined,
      hasData: totalExpenseAmount > 0,
      sparkData: spark(expenseTimeline),
      metricStyle: { icon: "DollarSign", color: "emerald", href: "/expenses" },
    },
    {
      slotId: "metric-1",
      content: { type: "metric", slug: "personnelCost" },
      label: "People",
      value: formatCurrency(personnelCost, "USD", undefined, { compact: true }),
      description: `${summaryMetrics.personnelPercent.toFixed(0)}% of total`,
      hasData: personnelCost > 0,
      metricStyle: { icon: "TrendingUp", color: "blue", href: "/team" },
    },
    {
      slotId: "metric-2",
      content: { type: "metric", slug: "anomalies" },
      label: "Anomalies",
      value: String(anomalyCount),
      description: anomalyCount > 0 ? "Unusual spend detected" : "All spend normal",
      hasData: true,
      metricStyle: { icon: "Zap", color: "amber", href: "/expenses" },
    },
    {
      slotId: "metric-3",
      content: { type: "metric", slug: "recurring" },
      label: "Recurring",
      value: String(recurringCount),
      description: `of ${expenseDetails.lineItems.length} expenses`,
      hasData: true,
      metricStyle: { icon: "BarChart3", color: "violet", href: "/expenses" },
    },
  ];

  // Merge: page defaults + all engine metrics
  const resolvedSlotData = [...pageDefaultSlots, ...allEngineSlots];

  // Timeline data
  const timeline = seriesToArray(totalExpenses);
  const opexTimeline = seriesToArray(totalOpex);
  const cogsTimeline = seriesToArray(totalCogs);

  return (
    <div>
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Expenses</h1>
          <p className="mt-1 text-sm text-surface-500">
            Intelligent spend management &mdash; AI categorized, anomaly tracked, fully searchable
          </p>
        </div>
        <AddExpenseForm
          scenarioId={scenarioId}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, category: a.category }))}
        />
      </div>

      <ExpensesView
        summaryMetrics={summaryMetrics}
        resolvedSlotData={resolvedSlotData}
        expenseDetails={expenseDetails}
        timeline={timeline}
        opexTimeline={opexTimeline}
        cogsTimeline={cogsTimeline}
        budgetTimeline={budgetTimeline}
        scenarioId={scenarioId}
      />
    </div>
  );
}
