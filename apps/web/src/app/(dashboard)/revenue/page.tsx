import { getCompany, getDefaultScenario, getRevenueStreams } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { seriesToArray, monthKey, computeSubscriptionDetail, type SubscriptionParams } from "@burnless/engine";
import { RevenueStreamsList } from "./revenue-streams-list";
import { AddRevenueStreamForm } from "./add-revenue-stream-form";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export default async function RevenuePage() {
  const company = await getCompany();
  if (!company) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">Set up your company first</h3>
        <p className="text-sm text-surface-500">Complete onboarding to start modeling revenue.</p>
      </div>
    );
  }

  const scenario = await getDefaultScenario(company.id);
  if (!scenario) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">Create a scenario first</h3>
        <p className="text-sm text-surface-500">You need a financial scenario to model revenue.</p>
      </div>
    );
  }

  const [data, streams] = await Promise.all([
    computeDashboardData(company.id, scenario.id),
    getRevenueStreams(scenario.id),
  ]);

  const { metrics, currentMonth, totalRevenue } = data;

  const currentMrr = metrics.mrr.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentRevenue = totalRevenue.get(currentMonth) ?? 0;
  const arr = currentMrr * 12;

  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevRevenue = totalRevenue.get(prevMonth) ?? 0;
  const revenueGrowth = prevRevenue > 0 ? (((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : null;
  const prevMrr = metrics.mrr.find((m) => m.month === prevMonth)?.value ?? 0;
  const mrrGrowth = prevMrr > 0 ? (((currentMrr - prevMrr) / prevMrr) * 100).toFixed(1) : null;

  // Compute SaaS metrics
  const churnRate = metrics.customerChurnRate.find((m) => m.month === currentMonth)?.value ?? 0;
  const arpa = metrics.arpa.find((m) => m.month === currentMonth)?.value ?? 0;
  const ltv = metrics.ltv.find((m) => m.month === currentMonth)?.value ?? 0;
  const totalCustomers = metrics.totalCustomers.find((m) => m.month === currentMonth)?.value ?? 0;

  // Stream data
  const streamData = streams.map((s) => {
    const params = (s.parameters ?? {}) as Record<string, unknown>;
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      parameters: params,
    };
  });

  const revenueTimeline = seriesToArray(totalRevenue);
  const mrrTimeline = metrics.mrr;
  const hasSaaS = streams.some((s) => s.type === "subscription");

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Revenue</h1>
          <p className="mt-1 text-sm text-surface-500">
            Where your money comes from &mdash; stream by stream
          </p>
        </div>
        <AddRevenueStreamForm scenarioId={scenario.id} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Total Revenue</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(currentRevenue)}<span className="text-base font-normal text-surface-400">/mo</span></p>
          {revenueGrowth && (
            <p className={`mt-1 text-xs font-medium ${Number(revenueGrowth) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {Number(revenueGrowth) >= 0 ? "+" : ""}{revenueGrowth}% MoM
            </p>
          )}
        </div>
        {hasSaaS && (
          <>
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <p className="text-sm font-medium text-surface-500">MRR</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(currentMrr)}</p>
              {mrrGrowth && (
                <p className={`mt-1 text-xs font-medium ${Number(mrrGrowth) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {Number(mrrGrowth) >= 0 ? "+" : ""}{mrrGrowth}% MoM
                </p>
              )}
              <p className="mt-1 text-xs text-surface-400">ARR: {formatCurrency(arr)}</p>
            </div>
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <p className="text-sm font-medium text-surface-500">Customers</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">{Math.round(totalCustomers)}</p>
              <p className="mt-1 text-xs text-surface-400">ARPA: {formatCurrency(arpa)}</p>
            </div>
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <p className="text-sm font-medium text-surface-500">Churn Rate</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">{churnRate.toFixed(1)}%</p>
              <p className="mt-1 text-xs text-surface-400">LTV: {formatCurrency(ltv)}</p>
            </div>
          </>
        )}
        {!hasSaaS && (
          <>
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <p className="text-sm font-medium text-surface-500">Streams</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">{streams.length}</p>
              <p className="mt-1 text-xs text-surface-400">Active revenue streams</p>
            </div>
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6 col-span-2">
              <p className="text-sm font-medium text-surface-500">Annual Run Rate</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(currentRevenue * 12)}</p>
              <p className="mt-1 text-xs text-surface-400">Based on current monthly revenue</p>
            </div>
          </>
        )}
      </div>

      {/* Revenue streams and charts */}
      <RevenueStreamsList
        streams={streamData}
        revenueTimeline={revenueTimeline}
        mrrTimeline={mrrTimeline}
        hasSaaS={hasSaaS}
        scenarioId={scenario.id}
      />
    </div>
  );
}
