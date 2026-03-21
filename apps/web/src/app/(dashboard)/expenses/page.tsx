import { Suspense } from "react";
import { getCompany, getActiveScenario, getBudgetScenario, getAccounts } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { computeExpenseDetails } from "@/lib/compute-expenses";
import { seriesToArray, monthKey } from "@burnless/engine";
import { ExpensesView } from "./expenses-view";
import { AddExpenseForm } from "./add-expense-form";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

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

  const { currentMonth, totalExpenses, totalOpex, totalCogs } = data;
  const totalExpenseAmount = totalExpenses.get(currentMonth) ?? 0;
  const opexAmount = totalOpex.get(currentMonth) ?? 0;
  const cogsAmount = totalCogs.get(currentMonth) ?? 0;
  const personnelCost = data.headcountCostSeries.get(currentMonth) ?? 0;

  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevTotal = totalExpenses.get(prevMonth) ?? 0;
  const changePercent = prevTotal > 0 ? ((totalExpenseAmount - prevTotal) / prevTotal * 100) : null;

  // Budget vs actuals data
  const budgetScenario = await getBudgetScenario(companyId);
  let budgetTimeline: { month: string; value: number }[] | null = null;
  if (budgetScenario && budgetScenario.id !== scenarioId) {
    const budgetData = await computeDashboardData(companyId, budgetScenario.id);
    budgetTimeline = seriesToArray(budgetData.totalExpenses);
  }

  // Summary metrics
  const summaryMetrics = {
    totalMonthly: totalExpenseAmount,
    changePercent: changePercent ? Number(changePercent) : null,
    personnelCost,
    personnelPercent: totalExpenseAmount > 0 ? (personnelCost / totalExpenseAmount * 100) : 0,
    opexAmount: Math.max(0, opexAmount - personnelCost),
    cogsAmount,
    anomalyCount: expenseDetails.anomalyCount,
    recurringCount: expenseDetails.recurringCount,
  };

  // Timeline data
  const timeline = seriesToArray(totalExpenses);
  const opexTimeline = seriesToArray(totalOpex);
  const cogsTimeline = seriesToArray(totalCogs);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Expenses</h1>
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
