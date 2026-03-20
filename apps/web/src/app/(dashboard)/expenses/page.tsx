import { getCompany, getActiveScenario, getBudgetScenario, getAccounts, getForecastLines } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { seriesToArray, monthKey } from "@burnless/engine";
import { ExpensesList } from "./expenses-list";
import { AddExpenseForm } from "./add-expense-form";

// Expense categories with display info
const EXPENSE_CATEGORIES = [
  { key: "people", label: "People", icon: "users" },
  { key: "software", label: "Software & Tools", icon: "laptop" },
  { key: "infrastructure", label: "Infrastructure", icon: "server" },
  { key: "office", label: "Office & Operations", icon: "building" },
  { key: "marketing", label: "Marketing", icon: "megaphone" },
  { key: "legal", label: "Legal & Professional", icon: "scale" },
  { key: "other", label: "Other", icon: "dots" },
] as const;

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

  const [data, accounts] = await Promise.all([
    computeDashboardData(company.id, scenario.id),
    getAccounts(company.id),
  ]);
  const { currentMonth, totalExpenses, totalOpex, totalCogs } = data;

  const totalExpenseAmount = totalExpenses.get(currentMonth) ?? 0;
  const opexAmount = totalOpex.get(currentMonth) ?? 0;
  const cogsAmount = totalCogs.get(currentMonth) ?? 0;
  const personnelCost = data.headcountCostSeries.get(currentMonth) ?? 0;

  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevTotal = totalExpenses.get(prevMonth) ?? 0;
  const changePercent = prevTotal > 0 ? (((totalExpenseAmount - prevTotal) / prevTotal) * 100).toFixed(1) : null;

  // Build expense breakdown for display
  const expenseBreakdown = [
    {
      category: "People",
      amount: personnelCost,
      percentage: totalExpenseAmount > 0 ? (personnelCost / totalExpenseAmount * 100) : 0,
      prevAmount: data.headcountCostSeries.get(prevMonth) ?? 0,
    },
    {
      category: "Operating Expenses",
      amount: opexAmount - personnelCost,
      percentage: totalExpenseAmount > 0 ? ((opexAmount - personnelCost) / totalExpenseAmount * 100) : 0,
      prevAmount: (data.totalOpex.get(prevMonth) ?? 0) - (data.headcountCostSeries.get(prevMonth) ?? 0),
    },
    {
      category: "Cost of Goods Sold",
      amount: cogsAmount,
      percentage: totalExpenseAmount > 0 ? (cogsAmount / totalExpenseAmount * 100) : 0,
      prevAmount: totalCogs.get(prevMonth) ?? 0,
    },
  ].filter((e) => e.amount > 0);

  const expenseTimeline = seriesToArray(totalExpenses);
  const opexTimeline = seriesToArray(totalOpex);
  const cogsTimeline = seriesToArray(totalCogs);

  // Budget vs actuals data
  const budgetScenario = await getBudgetScenario(company.id);
  let budgetTimeline: { month: string; value: number }[] | null = null;
  if (budgetScenario && budgetScenario.id !== scenario.id) {
    const budgetData = await computeDashboardData(company.id, budgetScenario.id);
    budgetTimeline = seriesToArray(budgetData.totalExpenses);
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Expenses</h1>
          <p className="mt-1 text-sm text-surface-500">
            Every dollar your company spends &mdash; tracked, categorized, and forecasted
          </p>
        </div>
        <AddExpenseForm
          scenarioId={scenario.id}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, category: a.category }))}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Total Monthly</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(totalExpenseAmount)}</p>
          {changePercent && (
            <p className={`mt-1 text-xs font-medium ${Number(changePercent) > 0 ? "text-red-600" : "text-green-600"}`}>
              {Number(changePercent) > 0 ? "+" : ""}{changePercent}% vs last month
            </p>
          )}
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">People</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(personnelCost)}</p>
          <p className="mt-1 text-xs text-surface-400">
            {totalExpenseAmount > 0 ? `${(personnelCost / totalExpenseAmount * 100).toFixed(0)}%` : "0%"} of total
          </p>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Operating</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(Math.max(0, opexAmount - personnelCost))}</p>
          <p className="mt-1 text-xs text-surface-400">Software, office, marketing</p>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">COGS</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(cogsAmount)}</p>
          <p className="mt-1 text-xs text-surface-400">Cost of goods sold</p>
        </div>
      </div>

      {/* Expenses breakdown and chart */}
      <ExpensesList
        breakdown={expenseBreakdown}
        timeline={expenseTimeline}
        opexTimeline={opexTimeline}
        cogsTimeline={cogsTimeline}
        scenarioId={scenario.id}
        budgetTimeline={budgetTimeline}
      />
    </div>
  );
}
