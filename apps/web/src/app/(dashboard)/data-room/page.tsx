export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getCompany, getServerScenarioId, getFundingRounds } from "@/lib/data";
import { getCompanyPlan } from "@/lib/api-helpers";
import { canPerformAction } from "@/lib/feature-gate";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { formatCompactAmount, formatPercent, type CurrencyCode } from "@burnless/types";
import { companyCurrency } from "@/lib/server-currency";
import { DataRoomView } from "./data-room-view";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function DataRoomPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="building your data room" />;

  // Plan gate: Data Room is Pro+ only
  const plan = await getCompanyPlan(company.id);
  const gate = canPerformAction(plan, "data_room");
  if (!gate.allowed) {
    return (
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-8 sm:p-12 text-center animate-scale-in">
        <div className="inline-flex items-center justify-center rounded-2xl bg-violet-500/10 p-4 mb-5">
          <Lock className="h-8 w-8 text-violet-500" />
        </div>
        <h3 className="text-xl font-bold text-surface-900 mb-2">Data Room</h3>
        <p className="text-sm text-surface-500 mb-8 max-w-sm mx-auto leading-relaxed">
          {gate.reason}
        </p>
        <Link
          href="/settings?tab=billing"
          className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-md hover:shadow-lg"
        >
          Upgrade Plan
        </Link>
      </div>
    );
  }

  const activeCookieId = await getServerScenarioId();
  const scenarioId = activeCookieId ?? null;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <DataRoomContent companyId={company.id} scenarioId={scenarioId} companyName={company.name} currency={companyCurrency(company)} />
    </Suspense>
  );
}

async function DataRoomContent({ companyId, scenarioId, companyName, currency }: { companyId: string; scenarioId: string | null; companyName: string; currency: CurrencyCode }) {
  const scenarioName = scenarioId ? "Active Scenario" : "Base";
  const [data, fundingRounds] = await Promise.all([
    computeDashboardData(companyId, scenarioId),
    getFundingRounds(companyId, null), // Data room is base-only by design (artifact warehouse)
  ]);

  // FMT-2 (Phase B horizon): read headline KPIs at the REAL current calendar
  // month (data.currentMonth), NOT the end of the now-full-horizon series — the
  // last element is an end-of-horizon projection, not "today".
  const { currentMonth } = data;
  const atCurrentMonth = (series: { month: string; value: number }[]) =>
    series.find((m) => m.month === currentMonth) ?? series[series.length - 1];

  const latestRevenue = atCurrentMonth(data.metrics.totalRevenue);
  const latestArr = atCurrentMonth(data.metrics.arr);
  const latestBurn = atCurrentMonth(data.metrics.netBurnRate);
  const latestRunway = atCurrentMonth(data.metrics.cashRunwayMonths);
  const latestGrossMargin = atCurrentMonth(data.metrics.grossMarginPercent);
  const latestCash = atCurrentMonth(data.metrics.cashPosition);
  const latestMrr = atCurrentMonth(data.metrics.mrr);
  const latestCustomers = atCurrentMonth(data.metrics.totalCustomers);

  const fmtCurrency = (v: number) => formatCompactAmount(v, currency);

  const keyMetrics = [
    { label: "Monthly Revenue", value: fmtCurrency(latestRevenue?.value ?? 0), category: "Revenue" },
    { label: "MRR", value: fmtCurrency(latestMrr?.value ?? 0), category: "Revenue" },
    { label: "ARR", value: fmtCurrency(latestArr?.value ?? 0), category: "Revenue" },
    { label: "Total Customers", value: String(Math.round(latestCustomers?.value ?? 0)), category: "Revenue" },
    { label: "Gross Margin", value: formatPercent(latestGrossMargin?.value ?? 0, undefined, 1), category: "Profitability" },
    { label: "Cash Position", value: fmtCurrency(latestCash?.value ?? 0), category: "Cash" },
    { label: "Net Burn Rate", value: fmtCurrency(latestBurn?.value ?? 0), category: "Cash" },
    { label: "Runway", value: latestRunway && latestRunway.value < 999 ? `${Math.round(latestRunway.value)} months` : "36+", category: "Cash" },
  ];

  const fundingData = fundingRounds.map((r) => ({
    round: r.type,
    amount: Number(r.amount),
    date: r.date ? (typeof r.date === "string" ? r.date : new Date(r.date).toISOString()).slice(0, 10) : "",
    valuation: r.preMoneyValuation ? Number(r.preMoneyValuation) : null,
  }));

  return (
    <DataRoomView
      companyName={companyName}
      scenarioName={scenarioName}
      scenarioAvailable={true}
      profitAndLoss={data.profitAndLoss}
      cashFlow={data.cashFlow}
      balanceSheet={data.balanceSheet}
      keyMetrics={keyMetrics}
      fundingRounds={fundingData}
      startingCash={data.startingCash}
      netBurnRate={latestBurn?.value ?? 0}
      runwayMonths={latestRunway?.value ?? 0}
    />
  );
}
