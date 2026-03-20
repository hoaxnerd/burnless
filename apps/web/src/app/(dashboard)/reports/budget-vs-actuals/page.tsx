import Link from "next/link";
import { getCompany, getDefaultScenario, getBudgetScenario, getAccounts, getForecastLines, getTransactions } from "@/lib/data";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeBudgetVsActuals,
  type ForecastLineInput,
  type AccountBudgetInput,
  type MonthlySeries,
  monthKey,
} from "@burnless/engine";
import { BudgetVsActualsView } from "./budget-vs-actuals-view";

export default async function BudgetVsActualsPage() {
  const company = await getCompany();
  if (!company) return <p>Set up your company first.</p>;

  const budgetScenario = await getBudgetScenario(company.id);
  const scenario = budgetScenario ?? (await getDefaultScenario(company.id));

  if (!scenario) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
          <span className="text-surface-300">/</span>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-surface-900">Budget vs Actuals</h1>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
          <p className="text-sm text-surface-500">Create a scenario first to compare budget vs actuals.</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), 0, 1);
  const periodEnd = new Date(now.getFullYear(), 11, 1);

  const [accounts, fLines, txns] = await Promise.all([
    getAccounts(company.id),
    getForecastLines(scenario.id),
    getTransactions(company.id),
  ]);

  // Compute budget from forecast
  const forecastInputs: ForecastLineInput[] = fLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: fl.startDate,
    endDate: fl.endDate,
  }));
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Build actuals from transactions
  const actualsByAccount = new Map<string, MonthlySeries>();
  for (const txn of txns) {
    const key = monthKey(txn.date);
    const existing = actualsByAccount.get(txn.accountId) ?? new Map();
    existing.set(key, (existing.get(key) ?? 0) + Number(txn.amount));
    actualsByAccount.set(txn.accountId, existing);
  }

  // Build BudgetVsActuals input
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const budgetInputs: AccountBudgetInput[] = [];
  const allAccountIds = new Set([...accountForecasts.keys(), ...actualsByAccount.keys()]);

  for (const accountId of allAccountIds) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    budgetInputs.push({
      accountId: account.id,
      accountName: account.name,
      category: account.category,
      isRevenue: account.category === "revenue" || account.category === "other_income",
      budgetValues: accountForecasts.get(accountId) ?? new Map(),
      actualValues: actualsByAccount.get(accountId) ?? new Map(),
    });
  }

  const bva = computeBudgetVsActuals(budgetInputs);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Budget vs Actuals</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} {budgetScenario ? "(budget)" : "(default scenario)"}
        </p>
      </div>
      <BudgetVsActualsView bva={bva} />
    </div>
  );
}
