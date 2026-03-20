import { getCompany, getActiveScenario, getBudgetScenario, getAccounts } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { computeExpenseDetails } from "@/lib/compute-expenses";
import { seriesToArray, monthKey } from "@burnless/engine";
import { ExpensesView } from "./expenses-view";
import { AddExpenseForm } from "./add-expense-form";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  if (!company) return <SetupPrompt context="tracking expenses" />;

  const scenario = await getActiveScenario(company.id, params.scenarioId);
  if (!scenario) return <ScenarioPrompt context="track expenses" />;

  const [data, accounts, expenseDetails] = await Promise.all([
    computeDashboardData(company.id, scenario.id),
    getAccounts(company.id),
    computeExpenseDetails(company.id, scenario.id),
  ]);

  const { currentMonth, totalExpenses, totalOpex, totalCogs } = data;
  const totalExpenseAmount = totalExpenses.get(currentMonth) ?? 0;
  const opexAmount = totalOpex.get(currentMonth) ?? 0;
  const personnelCost = data.headcountCostSeries.get(currentMonth) ?? 0;

  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevTotal = totalExpenses.get(prevMonth) ?? 0;
  const changePercent = prevTotal > 0 ? ((totalExpenseAmount - prevTotal) / prevTotal * 100) : null;

  const budgetScenario = await getBudgetScenario(company.id);
  let budgetTimeline: { month: string; value: number }[] | null = null;
  if (budgetScenario && budgetScenario.id !== scenario.id) {
    const budgetData = await computeDashboardData(company.id, budgetScenario.id);
    budgetTimeline = seriesToArray(budgetData.totalExpenses);
  }

  const summaryMetrics = {
    totalMonthly: totalExpenseAmount,
    changePercent: changePercent !== null ? Number(changePercent) : null,
    personnelCost,
    personnelPercent: totalExpenseAmount > 0 ? (personnelCost / totalExpenseAmount * 100) : 0,
    opexAmount: Math.max(0, opexAmount - personnelCost),
    cogsAmount: totalCogs.get(currentMonth) ?? 0,
    anomalyCount: expenseDetails.anomalyCount,
    recurringCount: expenseDetails.recurringCount,
  };

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
          scenarioId={scenario.id}
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
        scenarioId={scenario.id}
      />
    </div>
  );
}
