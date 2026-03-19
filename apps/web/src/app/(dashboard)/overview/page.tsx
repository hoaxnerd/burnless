import Link from "next/link";
import {
  getCompany,
  getDefaultScenario,
  getAccounts,
  getForecastLines,
  getRevenueStreams,
  getHeadcountPlans,
  getFundingRounds,
} from "@/lib/data";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeSubscriptionDetail,
  computeAllHeadcountCosts,
  computeAllMetrics,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type SubscriptionParams,
  type MetricsInput,
  type MonthlySeries,
  addSeries,
  subtractSeries,
  monthKey,
} from "@burnless/engine";

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

  // Fetch all data for the scenario
  const [accounts, fLines, revStreams, hcPlans, funding] = await Promise.all([
    getAccounts(company.id),
    getForecastLines(scenario.id),
    getRevenueStreams(scenario.id),
    getHeadcountPlans(scenario.id),
    getFundingRounds(company.id),
  ]);

  // Define period (current year)
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), 0, 1);
  const periodEnd = new Date(now.getFullYear(), 11, 1);
  const currentMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));

  // Compute forecasts
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

  // Revenue
  const revInputs: RevenueStreamInput[] = revStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  // Subscription details
  const subStreams = revStreams.filter((rs) => rs.type === "subscription");
  const subDetails = subStreams.flatMap((rs) =>
    computeSubscriptionDetail(
      (rs.parameters ?? {}) as unknown as SubscriptionParams,
      periodStart,
      periodEnd
    )
  );

  // Headcount
  const hcInputs: HeadcountPlanInput[] = hcPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    count: hp.count,
    salary: Number(hp.salary),
    startDate: hp.startDate,
    endDate: hp.endDate,
    benefitsRate: Number(hp.benefitsRate),
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Aggregate by category
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  let totalRevenue = new Map(revenueValues);
  let totalCogs: MonthlySeries = new Map();
  let totalOpex: MonthlySeries = new Map();

  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    if (account.category === "revenue") totalRevenue = addSeries(totalRevenue, values);
    else if (account.category === "cogs") totalCogs = addSeries(totalCogs, values);
    else if (account.category === "operating_expense") totalOpex = addSeries(totalOpex, values);
  }
  totalOpex = addSeries(totalOpex, headcountCosts.totalCost);
  const totalExpenses = addSeries(totalCogs, totalOpex);
  const netIncome = subtractSeries(totalRevenue, totalExpenses);

  // Cash position
  const startingCash = funding.reduce((sum, r) => sum + Number(r.amount), 0);
  const cashPosition: MonthlySeries = new Map();
  let runningCash = startingCash;
  for (const m of Array.from(netIncome.keys()).sort()) {
    runningCash += netIncome.get(m) ?? 0;
    cashPosition.set(m, runningCash);
  }

  // Compute metrics
  const metricsInput: MetricsInput = {
    revenue: totalRevenue,
    subscriptionDetails: subDetails,
    totalExpenses,
    cogs: totalCogs,
    operatingExpenses: totalOpex,
    cashPosition,
    netIncome,
    headcount: headcountCosts.headcount,
  };
  const metrics = computeAllMetrics(metricsInput);

  // Get current month values
  const currentMrr = metrics.mrr.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentBurn = metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentRunway = metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentCash = metrics.cashPosition.find((m) => m.month === currentMonth)?.value ?? startingCash;

  // MoM growth
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMrr = metrics.mrr.find((m) => m.month === prevMonth)?.value ?? 0;
  const mrrGrowth = prevMrr > 0 ? (((currentMrr - prevMrr) / prevMrr) * 100).toFixed(1) : null;

  const hasData = fLines.length > 0 || revStreams.length > 0 || hcPlans.length > 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Overview</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} scenario
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          label="Cash Balance"
          value={hasData ? formatCurrency(currentCash) : "$0"}
          description={hasData ? `Based on ${scenario.name} scenario` : "Add funding rounds to see cash"}
        />
        <MetricCard
          label="Monthly Burn"
          value={hasData ? formatCurrency(currentBurn) : "$0"}
          description={hasData ? "Net burn rate" : "Add expenses to calculate"}
        />
        <MetricCard
          label="Runway"
          value={hasData ? (currentRunway >= 999 ? "∞" : `${Math.round(currentRunway)} months`) : "-- months"}
          description={hasData ? "At current burn rate" : "Based on cash and burn rate"}
        />
        <MetricCard
          label="MRR"
          value={hasData ? formatCurrency(currentMrr) : "$0"}
          change={mrrGrowth ? `${Number(mrrGrowth) >= 0 ? "+" : ""}${mrrGrowth}% MoM` : undefined}
          description={hasData ? "Monthly recurring revenue" : "Add revenue streams to track"}
        />
      </div>

      {/* Quick actions or summary */}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Key metrics summary */}
          <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Key Metrics</h2>
            <div className="space-y-3">
              <MetricRow label="ARR" value={formatCurrency(currentMrr * 12)} />
              <MetricRow label="Gross Margin" value={`${metrics.grossMarginPercent.find((m) => m.month === currentMonth)?.value ?? 0}%`} />
              <MetricRow label="Headcount" value={`${Math.round(headcountCosts.headcount.get(currentMonth) ?? 0)}`} />
              <MetricRow label="Rev/Employee" value={formatCurrency(metrics.revenuePerEmployee.find((m) => m.month === currentMonth)?.value ?? 0)} />
            </div>
          </div>

          {/* SaaS metrics (if applicable) */}
          {subDetails.length > 0 && (
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">SaaS Metrics</h2>
              <div className="space-y-3">
                <MetricRow label="Customers" value={`${metrics.totalCustomers.find((m) => m.month === currentMonth)?.value ?? 0}`} />
                <MetricRow label="ARPA" value={formatCurrency(metrics.arpa.find((m) => m.month === currentMonth)?.value ?? 0)} />
                <MetricRow label="Churn Rate" value={`${metrics.customerChurnRate.find((m) => m.month === currentMonth)?.value ?? 0}%`} />
                <MetricRow label="LTV" value={formatCurrency(metrics.ltv.find((m) => m.month === currentMonth)?.value ?? 0)} />
                <MetricRow label="Quick Ratio" value={`${metrics.saasQuickRatio.find((m) => m.month === currentMonth)?.value ?? 0}x`} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, change, description }: {
  label: string; value: string; change?: string; description: string;
}) {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
      <p className="text-sm font-medium text-surface-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-surface-900">{value}</p>
      {change && (
        <p className={`mt-1 text-xs font-medium ${change.startsWith("+") ? "text-green-600" : "text-red-600"}`}>
          {change}
        </p>
      )}
      <p className="mt-1 text-xs text-surface-400">{description}</p>
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
