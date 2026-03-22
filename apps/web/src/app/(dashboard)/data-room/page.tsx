import { Suspense } from "react";
import { getCompany, getDefaultScenario, getFundingRounds } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { DataRoomView } from "./data-room-view";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function DataRoomPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="building your data room" />;
  const scenario = await getDefaultScenario(company.id);
  if (!scenario) return <ScenarioPrompt context="generate investor-ready reports" />;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <DataRoomContent companyId={company.id} scenarioId={scenario.id} companyName={company.name} scenarioName={scenario.name} />
    </Suspense>
  );
}

async function DataRoomContent({ companyId, scenarioId, companyName, scenarioName }: { companyId: string; scenarioId: string; companyName: string; scenarioName: string }) {
  const [data, fundingRounds] = await Promise.all([
    computeDashboardData(companyId, scenarioId),
    getFundingRounds(companyId),
  ]);

  const latestRevenue = data.metrics.totalRevenue[data.metrics.totalRevenue.length - 1];
  const latestArr = data.metrics.arr[data.metrics.arr.length - 1];
  const latestBurn = data.metrics.netBurnRate[data.metrics.netBurnRate.length - 1];
  const latestRunway = data.metrics.cashRunwayMonths[data.metrics.cashRunwayMonths.length - 1];
  const latestGrossMargin = data.metrics.grossMarginPercent[data.metrics.grossMarginPercent.length - 1];
  const latestCash = data.metrics.cashPosition[data.metrics.cashPosition.length - 1];
  const latestMrr = data.metrics.mrr[data.metrics.mrr.length - 1];
  const latestCustomers = data.metrics.totalCustomers[data.metrics.totalCustomers.length - 1];

  const fmtCurrency = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  };

  const keyMetrics = [
    { label: "Monthly Revenue", value: fmtCurrency(latestRevenue?.value ?? 0), category: "Revenue" },
    { label: "MRR", value: fmtCurrency(latestMrr?.value ?? 0), category: "Revenue" },
    { label: "ARR", value: fmtCurrency(latestArr?.value ?? 0), category: "Revenue" },
    { label: "Total Customers", value: String(Math.round(latestCustomers?.value ?? 0)), category: "Revenue" },
    { label: "Gross Margin", value: `${(latestGrossMargin?.value ?? 0).toFixed(1)}%`, category: "Profitability" },
    { label: "Cash Position", value: fmtCurrency(latestCash?.value ?? 0), category: "Cash" },
    { label: "Net Burn Rate", value: fmtCurrency(latestBurn?.value ?? 0), category: "Cash" },
    { label: "Runway", value: latestRunway && latestRunway.value < 999 ? `${Math.round(latestRunway.value)} months` : "36+", category: "Cash" },
  ];

  const fundingData = fundingRounds.map((r) => ({
    round: r.type,
    amount: Number(r.amount),
    date: r.date ? (typeof r.date === "string" ? r.date : r.date.toISOString()).slice(0, 10) : "",
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
