import Link from "next/link";
import { getCompany, getActiveScenario, getScenarios, getAccounts } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { seriesToArray, monthKey } from "@burnless/engine";
import { MetricCard } from "@/components/ui";
import { DashboardCharts } from "./dashboard-charts";
import { AiInsightBanner } from "./ai-insight-banner";
import { QuickActions } from "./quick-actions";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  if (!company) return <SetupPrompt />;

  const scenario = await getActiveScenario(company.id, params.scenarioId);
  if (!scenario) return <NoScenarioPrompt />;

  const [data, allScenarios, accounts] = await Promise.all([
    computeDashboardData(company.id, scenario.id),
    getScenarios(company.id),
    getAccounts(company.id),
  ]);
  const { metrics, hasData, currentMonth } = data;

  const currentMrr = metrics.mrr.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentBurn = metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentRunway = metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentCash = metrics.cashPosition.find((m) => m.month === currentMonth)?.value ?? data.startingCash;

  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMrr = metrics.mrr.find((m) => m.month === prevMonth)?.value ?? 0;
  const mrrGrowth = prevMrr > 0 ? (((currentMrr - prevMrr) / prevMrr) * 100).toFixed(1) : null;
  const prevBurn = metrics.netBurnRate.find((m) => m.month === prevMonth)?.value ?? 0;
  const burnChange = prevBurn > 0 ? (((currentBurn - prevBurn) / prevBurn) * 100).toFixed(1) : null;
  const prevCash = metrics.cashPosition.find((m) => m.month === prevMonth)?.value ?? data.startingCash;
  const cashChange = prevCash > 0 ? (((currentCash - prevCash) / prevCash) * 100).toFixed(1) : null;

  const revenueArr = seriesToArray(data.totalRevenue);
  const expensesArr = seriesToArray(data.totalExpenses);
  const revenueVsExpenses = revenueArr.map((r, i) => ({
    month: r.month,
    revenue: r.value,
    expenses: expensesArr[i]?.value ?? 0,
  }));

  const cashData = metrics.cashPosition;
  const pinnedScenarios = allScenarios.filter((s) => !s.isDefault).slice(0, 4);

  return (
    <div>
      {/* AI Insight Banner */}
      {hasData && (
        <AiInsightBanner
          runway={currentRunway}
          burnRate={currentBurn}
          mrrGrowth={mrrGrowth ? Number(mrrGrowth) : 0}
          cash={currentCash}
        />
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Dashboard</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; Financial command center
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          label="Cash Balance"
          value={hasData ? formatCurrency(currentCash) : "$0"}
          change={cashChange ? `${Number(cashChange) >= 0 ? "+" : ""}${cashChange}%` : undefined}
          description={hasData ? "Current cash position" : "Add funding to see cash"}
        />
        <MetricCard
          label="Monthly Burn"
          value={hasData ? formatCurrency(currentBurn) : "$0"}
          change={burnChange ? `${Number(burnChange) >= 0 ? "+" : ""}${burnChange}% MoM` : undefined}
          description={hasData ? "Net burn rate" : "Add expenses to calculate"}
        />
        <MetricCard
          label="Runway"
          value={hasData ? (currentRunway >= 999 ? "\u221e" : `${Math.round(currentRunway)} months`) : "-- months"}
          description={hasData ? "At current burn rate" : "Based on cash and burn"}
        />
        <MetricCard
          label="MRR"
          value={hasData ? formatCurrency(currentMrr) : "$0"}
          change={mrrGrowth ? `${Number(mrrGrowth) >= 0 ? "+" : ""}${mrrGrowth}% MoM` : undefined}
          description={hasData ? "Monthly recurring revenue" : "Add revenue streams"}
        />
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          {/* Quick Actions */}
          <QuickActions
            scenarioId={scenario.id}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, category: a.category }))}
          />

          {/* Charts */}
          <DashboardCharts
            revenueVsExpenses={revenueVsExpenses}
            cashData={cashData}
            burnData={metrics.netBurnRate}
            runwayData={metrics.cashRunwayMonths.map((m) => ({
              ...m,
              value: Math.min(m.value, 100),
            }))}
            mrrData={metrics.mrr}
            hasSaaS={metrics.mrr.some((m) => m.value > 0)}
          />

          {/* Pinned Scenarios & Key Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Pinned Scenarios */}
            {pinnedScenarios.length > 0 && (
              <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-surface-900">Scenarios</h2>
                  <Link href="/scenarios" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    View all
                  </Link>
                </div>
                <div className="space-y-3">
                  {pinnedScenarios.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-surface-900">{s.name}</p>
                        <span className="text-xs text-surface-500">{s.type}</span>
                      </div>
                      <Link
                        href={`/scenarios`}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">Key Metrics</h2>
              <div className="space-y-3">
                <MetricRow label="ARR" value={formatCurrency(currentMrr * 12)} />
                <MetricRow label="Gross Margin" value={`${metrics.grossMarginPercent.find((m) => m.month === currentMonth)?.value ?? 0}%`} />
                <MetricRow label="Headcount" value={`${Math.round(data.headcountSeries.get(currentMonth) ?? 0)}`} />
                <MetricRow label="Rev/Employee" value={formatCurrency(metrics.revenuePerEmployee.find((m) => m.month === currentMonth)?.value ?? 0)} />
                <MetricRow label="EBITDA" value={formatCurrency(metrics.ebitda.find((m) => m.month === currentMonth)?.value ?? 0)} />
                <MetricRow label="Rule of 40" value={`${metrics.ruleOf40.find((m) => m.month === currentMonth)?.value ?? 0}`} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-surface-600">{label}</span>
      <span className="text-sm font-semibold text-surface-900">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
      <h2 className="text-lg font-semibold text-surface-900 mb-4">Get started</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard title="Add expenses" description="Track where your money goes" action="Add expenses" href="/expenses" />
        <ActionCard title="Add revenue" description="Model your revenue streams" action="Add revenue" href="/revenue" />
        <ActionCard title="Talk to AI" description="Let AI build your financial model" action="Start chatting" href="/ai" />
      </div>
    </div>
  );
}

function ActionCard({ title, description, action, href }: {
  title: string; description: string; action: string; href: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-surface-200 p-4 hover:border-brand-300 hover:bg-brand-50/50 transition-colors">
      <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
      <p className="mt-1 text-xs text-surface-500">{description}</p>
      <span className="mt-3 inline-block text-xs font-medium text-brand-600">{action} &rarr;</span>
    </Link>
  );
}

function SetupPrompt() {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
      <h3 className="text-lg font-semibold text-surface-900 mb-2">Welcome to Burnless</h3>
      <p className="text-sm text-surface-500 mb-6">Complete onboarding to set up your company.</p>
      <Link href="/onboarding" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
        Get started
      </Link>
    </div>
  );
}

function NoScenarioPrompt() {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
      <h3 className="text-lg font-semibold text-surface-900 mb-2">Create Your First Scenario</h3>
      <p className="text-sm text-surface-500 mb-6">Start modeling your business financials.</p>
      <Link href="/scenarios/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
        Create scenario
      </Link>
    </div>
  );
}
