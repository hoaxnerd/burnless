export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import Link from "next/link";
import { getCompany, getServerScenarioId, getAccounts, getForecastLines, getTransactions } from "@/lib/data";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeBudgetVsActuals,
  METRIC_REGISTRY,
  type ForecastLineInput,
  type AccountBudgetInput,
  type MonthlySeries,
  type ResolvedSlotData,
  monthKey,
} from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { formatCurrency, isValidCurrency, type CurrencyCode } from "@burnless/types";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { BudgetVsActualsView } from "./budget-vs-actuals-view";

export default async function BudgetVsActualsPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="viewing reports" />;

  const scenarioId = (await getServerScenarioId()) ?? null;
  const safeCurrency: CurrencyCode = isValidCurrency(company.currency) ? company.currency : "USD";

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Budget vs Actuals</h1>
        <p className="mt-1 text-sm text-surface-500">{company.name}</p>
      </div>
      <Suspense fallback={<ReportContentSkeleton />}>
        <BudgetVsActualsContent companyId={company.id} scenarioId={scenarioId} currency={safeCurrency} locale={company.locale} />
      </Suspense>
    </div>
  );
}

async function BudgetVsActualsContent({ companyId, scenarioId, currency, locale }: { companyId: string; scenarioId: string | null; currency: CurrencyCode; locale?: string | null }) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), 0, 1);
  const periodEnd = new Date(now.getFullYear(), 11, 1);

  const [accounts, fLines, txns] = await Promise.all([
    getAccounts(companyId),
    getForecastLines(companyId, scenarioId),
    getTransactions(companyId),
  ]);

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

  const actualsByAccount = new Map<string, MonthlySeries>();
  for (const txn of txns) {
    const key = monthKey(txn.date);
    const existing = actualsByAccount.get(txn.accountId) ?? new Map();
    existing.set(key, (existing.get(key) ?? 0) + Number(txn.amount));
    actualsByAccount.set(txn.accountId, existing);
  }

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

  // Compute dashboard data for engine metrics (swap targets)
  const data = await computeDashboardData(companyId, scenarioId);
  const { currentMonth } = data;
  const now2 = new Date();
  const prevMonth = monthKey(new Date(now2.getFullYear(), now2.getMonth() - 1, 1));

  const allEngineSlots: ResolvedSlotData[] = METRIC_REGISTRY.map((def) =>
    buildSlotMetricCard(def.slug, data.metrics, currentMonth, prevMonth)
  );

  const totalBudgetSum = bva.totalBudget.reduce((s, v) => s + v.value, 0);
  const totalActualSum = bva.totalActual.reduce((s, v) => s + v.value, 0);
  const totalVarianceSum = bva.totalVariance.reduce((s, v) => s + v.value, 0);
  const safeLocale = locale ?? undefined;
  const fc = (v: number) => formatCurrency(v, currency, safeLocale, { compact: true });

  const pageDefaultSlots: ResolvedSlotData[] = [
    {
      slotId: "metric-0",
      content: { type: "metric", slug: "totalBudget" },
      label: "Total Budget",
      value: fc(totalBudgetSum),
      hasData: totalBudgetSum !== 0,
      metricStyle: { icon: "DollarSign", color: "emerald", href: "/reports/budget-vs-actuals" },
    },
    {
      slotId: "metric-1",
      content: { type: "metric", slug: "totalActual" },
      label: "Total Actual",
      value: fc(totalActualSum),
      hasData: totalActualSum !== 0,
      metricStyle: { icon: "DollarSign", color: "blue", href: "/reports/budget-vs-actuals" },
    },
    {
      slotId: "metric-2",
      content: { type: "metric", slug: "totalVariance" },
      label: "Total Variance",
      value: fc(totalVarianceSum),
      change: totalVarianceSum >= 0 ? "Favorable" : "Unfavorable",
      hasData: true,
      metricStyle: { icon: "BarChart3", color: "violet", href: "/reports/budget-vs-actuals" },
    },
  ];

  const resolvedSlotData = [...pageDefaultSlots, ...allEngineSlots];

  return <BudgetVsActualsView bva={bva} resolvedSlotData={resolvedSlotData} />;
}
