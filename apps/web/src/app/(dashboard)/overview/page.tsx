import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { seriesToArray, monthKey } from "@burnless/engine";
import { MetricCard } from "@/components/ui";
import { OverviewCharts } from "./overview-charts";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export default async function OverviewPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt />;

  const scenario = await getDefaultScenario(company.id);
  if (!scenario) return <NoScenarioPrompt />;

  const data = await computeDashboardData(company.id, scenario.id);
  const { metrics, hasData, currentMonth } = data;

  // Current month values
  const currentMrr = metrics.mrr.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentBurn = metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentRunway = metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentCash = metrics.cashPosition.find((m) => m.month === currentMonth)?.value ?? data.startingCash;

  // MoM growth
  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMrr = metrics.mrr.find((m) => m.month === prevMonth)?.value ?? 0;
  const mrrGrowth = prevMrr > 0 ? (((currentMrr - prevMrr) / prevMrr) * 100).toFixed(1) : null;

  const prevBurn = metrics.netBurnRate.find((m) => m.month === prevMonth)?.value ?? 0;
  const burnChange = prevBurn > 0 ? (((currentBurn - prevBurn) / prevBurn) * 100).toFixed(1) : null;

  // Chart data
  const revenueData = metrics.totalRevenue;
  const cashData = metrics.cashPosition;
  const mrrData = metrics.mrr;
  const burnRateData = metrics.netBurnRate;
  const runwayData = metrics.cashRunwayMonths.map((m) => ({
    ...m,
    value: Math.min(m.value, 100), // cap for chart readability
  }));

  const revenueArr = seriesToArray(data.totalRevenue);
  const expensesArr = seriesToArray(data.totalExpenses);
  const revenueVsExpenses = revenueArr.map((r, i) => ({
    month: r.month,
    revenue: r.value,
    expenses: expensesArr[i]?.value ?? 0,
  }));

  const hasSaaS = metrics.mrr.some((m) => m.value > 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Overview</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} scenario
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          label="Cash Balance"
          value={hasData ? formatCurrency(currentCash) : "$0"}
          description={hasData ? `Based on ${scenario.name} scenario` : "Add funding rounds to see cash"}
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
          description={hasData ? "At current burn rate" : "Based on cash and burn rate"}
        />
        <MetricCard
          label="MRR"
          value={hasData ? formatCurrency(currentMrr) : "$0"}
          change={mrrGrowth ? `${Number(mrrGrowth) >= 0 ? "+" : ""}${mrrGrowth}% MoM` : undefined}
          description={hasData ? "Monthly recurring revenue" : "Add revenue streams to track"}
        />
      </div>

      {!hasData ? (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Get started</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ActionCard title="Set up your company" description="Add company details, stage, and business model" action="Configure" href="/settings" />
            <ActionCard title="Create a scenario" description="Model your base case financial projections" action="Create" href="/scenarios/new" />
            <ActionCard title="Ask the AI" description="Describe your business and let AI build your financial model" action="Start chatting" href="/ai" />
          </div>
        </div>
      ) : (
        <>
          {/* Interactive charts */}
          <OverviewCharts
            revenueData={revenueData}
            expensesData={seriesToArray(data.totalExpenses)}
            cashData={cashData}
            mrrData={mrrData}
            burnRateData={burnRateData}
            runwayData={runwayData}
            revenueVsExpenses={revenueVsExpenses}
            hasSaaS={hasSaaS}
          />

          {/* Key metrics tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
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

            {hasSaaS && (
              <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
                <h2 className="text-lg font-semibold text-surface-900 mb-4">SaaS Metrics</h2>
                <div className="space-y-3">
                  <MetricRow label="Customers" value={`${metrics.totalCustomers.find((m) => m.month === currentMonth)?.value ?? 0}`} />
                  <MetricRow label="ARPA" value={formatCurrency(metrics.arpa.find((m) => m.month === currentMonth)?.value ?? 0)} />
                  <MetricRow label="Churn Rate" value={`${metrics.customerChurnRate.find((m) => m.month === currentMonth)?.value ?? 0}%`} />
                  <MetricRow label="LTV" value={formatCurrency(metrics.ltv.find((m) => m.month === currentMonth)?.value ?? 0)} />
                  <MetricRow label="Quick Ratio" value={`${metrics.saasQuickRatio.find((m) => m.month === currentMonth)?.value ?? 0}x`} />
                  <MetricRow label="Burn Multiple" value={`${metrics.burnMultiple.find((m) => m.month === currentMonth)?.value ?? 0}x`} />
                </div>
              </div>
            )}
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
