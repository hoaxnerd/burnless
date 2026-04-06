"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowLeft, Download, Printer, Sparkles } from "lucide-react";
import Link from "next/link";
import { AreaChartWidget, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard, SwappableMetricCard } from "@/components/ui";
import { AiGate } from "@/components/ai/ai-gate";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui/page-grid";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { PageProvider } from "@/components/providers/page-context";
import type { ResolvedSlotData } from "@burnless/engine";
import type { SubcategoryBreakdown } from "@/lib/compute-expenses";

interface MetricPoint {
  month: string;
  value: number;
}

interface BoardData {
  companyName: string;
  scenarioName: string;
  reportMonth: string;
  revenue: {
    current: number;
    previous: number;
    growthPercent: number;
    mrr: number;
    arr: number;
    customers: number;
    churnRate: number;
    arpa: number;
    hasSaaS: boolean;
    streamCount: number;
  };
  expenses: {
    current: number;
    previous: number;
    changePercent: number;
    topCategories: SubcategoryBreakdown[];
    anomalyCount: number;
  };
  cash: {
    position: number;
    burnRate: number;
    runway: number;
    totalFunding: number;
    netIncome: number;
  };
  profitability: {
    grossMargin: number;
    netIncome: number;
    netMargin: number;
  };
  revenueTimeline: MetricPoint[];
  expenseTimeline: MetricPoint[];
  cashTimeline: MetricPoint[];
  pnlSummary: {
    revenue: MetricPoint[];
    cogs: MetricPoint[];
    grossProfit: MetricPoint[];
    opex: MetricPoint[];
    netIncome: MetricPoint[];
  };
}

function formatMonthYear(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ── AI narrative generation ──────────────────────────────────────────────────

function generateRevenueNarrative(r: BoardData["revenue"]): string {
  const parts: string[] = [];
  if (r.growthPercent > 0) {
    parts.push(`Revenue grew ${r.growthPercent.toFixed(1)}% month-over-month to ${formatCompactCurrency(r.current)}/mo.`);
  } else if (r.growthPercent < 0) {
    parts.push(`Revenue declined ${Math.abs(r.growthPercent).toFixed(1)}% to ${formatCompactCurrency(r.current)}/mo.`);
  } else {
    parts.push(`Revenue held steady at ${formatCompactCurrency(r.current)}/mo.`);
  }

  if (r.hasSaaS) {
    parts.push(`MRR stands at ${formatCompactCurrency(r.mrr)} (ARR: ${formatCompactCurrency(r.arr)}) across ${Math.round(r.customers)} customers at ${formatCompactCurrency(r.arpa)} ARPA.`);
    if (r.churnRate > 5) {
      parts.push(`Churn at ${r.churnRate.toFixed(1)}% requires attention.`);
    } else if (r.churnRate > 0) {
      parts.push(`Churn is healthy at ${r.churnRate.toFixed(1)}%.`);
    }
  }

  return parts.join(" ");
}

function generateExpenseNarrative(e: BoardData["expenses"]): string {
  const parts: string[] = [];
  if (e.changePercent > 5) {
    parts.push(`Total spend increased ${e.changePercent.toFixed(1)}% to ${formatCompactCurrency(e.current)}/mo.`);
  } else if (e.changePercent < -5) {
    parts.push(`Spend decreased ${Math.abs(e.changePercent).toFixed(1)}% to ${formatCompactCurrency(e.current)}/mo — good cost discipline.`);
  } else {
    parts.push(`Spend is stable at ${formatCompactCurrency(e.current)}/mo.`);
  }

  if (e.topCategories.length > 0) {
    const top = e.topCategories[0]!;
    parts.push(`Largest category: ${top.subcategory} at ${formatCompactCurrency(top.amount)} (${top.percentage.toFixed(0)}% of total).`);
  }

  if (e.anomalyCount > 0) {
    parts.push(`${e.anomalyCount} expense anomal${e.anomalyCount === 1 ? "y" : "ies"} flagged for review.`);
  }

  return parts.join(" ");
}

function generateCashNarrative(c: BoardData["cash"]): string {
  const parts: string[] = [];
  parts.push(`Cash position: ${formatCompactCurrency(c.position)}.`);

  if (c.burnRate > 0) {
    parts.push(`Net burn rate: ${formatCompactCurrency(c.burnRate)}/mo.`);
    if (c.runway > 36) {
      parts.push("Runway exceeds 36 months — strong position.");
    } else if (c.runway >= 18) {
      parts.push(`${Math.round(c.runway)} months of runway — comfortable.`);
    } else if (c.runway >= 6) {
      parts.push(`${Math.round(c.runway)} months of runway — consider fundraising timeline.`);
    } else if (c.runway > 0) {
      parts.push(`Only ${Math.round(c.runway)} months of runway remaining — urgent action needed.`);
    }
  }

  if (c.netIncome > 0) {
    parts.push("Company is cash-flow positive.");
  }

  return parts.join(" ");
}

// ── Section component ────────────────────────────────────────────────────────

function ReportSection({
  title,
  narrative,
  children,
}: {
  title: string;
  narrative: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden print:break-inside-avoid print:border-surface-300">
      <div className="px-6 py-4 border-b border-surface-200 bg-surface-50">
        <h2 className="text-lg font-semibold text-surface-900">{title}</h2>
      </div>

      {/* AI Narrative */}
      <AiGate
        feature="insights"
        fallback={
          <div className="px-6 py-3 border-b border-surface-100 bg-surface-50/50">
            <p className="text-xs text-surface-600 leading-relaxed">{narrative}</p>
          </div>
        }
      >
        <div className="px-6 py-3 border-b border-surface-100 bg-brand-50/30">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3 w-3 text-brand-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-surface-700 leading-relaxed">{narrative}</p>
          </div>
        </div>
      </AiGate>

      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function BoardUpdateView({ data, resolvedSlotData }: { data: BoardData; resolvedSlotData: ResolvedSlotData[] }) {
  const d = data;

  const handlePrint = () => window.print();

  // ── PageGrid layout ──────────────────────────────────────────────────────

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 6, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 9, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "revenue-section", x: 0, w: 12, h: 14, minH: 8 },
    { i: "expenses-section", x: 0, w: 12, h: 14, minH: 8 },
    { i: "cash-runway-section", x: 0, w: 12, h: 14, minH: 8 },
    { i: "pnl-table", x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "revenue-section", x: 0, w: 6, h: 14, minH: 8 },
    { i: "expenses-section", x: 0, w: 6, h: 14, minH: 8 },
    { i: "cash-runway-section", x: 0, w: 6, h: 14, minH: 8 },
    { i: "pnl-table", x: 0, w: 6, h: 16, minH: 8 },
  ], []);

  const widgets = useMemo(() => ({
    "metric-0": (
      <SwappableMetricCard
        slug="revenue"
        pageId="reports/board-update"
        label="Revenue"
        value={formatCompactCurrency(d.revenue.current)}
        change={`${d.revenue.growthPercent > 0 ? "+" : ""}${d.revenue.growthPercent.toFixed(1)}%`}
        description="MoM"
        stagger={0}
      />
    ),
    "metric-1": (
      <SwappableMetricCard
        slug="netBurn"
        pageId="reports/board-update"
        label="Net Burn"
        value={formatCompactCurrency(d.cash.burnRate)}
        description="/month"
        lowerIsBetter
        stagger={1}
      />
    ),
    "metric-2": (
      <SwappableMetricCard
        slug="cash"
        pageId="reports/board-update"
        label="Cash"
        value={formatCompactCurrency(d.cash.position)}
        description={d.cash.runway > 36 ? "36+ mo runway" : `${Math.round(d.cash.runway)} mo runway`}
        stagger={2}
      />
    ),
    "metric-3": (
      <SwappableMetricCard
        slug="grossMargin"
        pageId="reports/board-update"
        label="Gross Margin"
        value={`${d.profitability.grossMargin.toFixed(1)}%`}
        description={d.profitability.grossMargin >= 60 ? "Healthy" : d.profitability.grossMargin >= 40 ? "Average" : "Below benchmark"}
        stagger={3}
      />
    ),
    "revenue-section": (
      <ReportSection
        title="Revenue"
        narrative={generateRevenueNarrative(d.revenue)}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
          <ChartCard title="Revenue Trend" subtitle="Monthly total revenue">
            <AreaChartWidget data={d.revenueTimeline} color={chartColors.brand} height={200} />
          </ChartCard>
          {d.revenue.hasSaaS && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-surface-200 p-3">
                  <p className="text-[10px] font-medium text-surface-500 uppercase">MRR</p>
                  <p className="text-lg font-bold text-surface-900 tabular-nums">{formatCompactCurrency(d.revenue.mrr)}</p>
                </div>
                <div className="rounded-lg border border-surface-200 p-3">
                  <p className="text-[10px] font-medium text-surface-500 uppercase">ARR</p>
                  <p className="text-lg font-bold text-surface-900 tabular-nums">{formatCompactCurrency(d.revenue.arr)}</p>
                </div>
                <div className="rounded-lg border border-surface-200 p-3">
                  <p className="text-[10px] font-medium text-surface-500 uppercase">Customers</p>
                  <p className="text-lg font-bold text-surface-900 tabular-nums">{Math.round(d.revenue.customers)}</p>
                </div>
                <div className="rounded-lg border border-surface-200 p-3">
                  <p className="text-[10px] font-medium text-surface-500 uppercase">Churn</p>
                  <p className="text-lg font-bold text-surface-900 tabular-nums">{d.revenue.churnRate.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </ReportSection>
    ),
    "expenses-section": (
      <ReportSection
        title="Expenses"
        narrative={generateExpenseNarrative(d.expenses)}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
          <ChartCard title="Expense Trend" subtitle="Monthly total spend">
            <AreaChartWidget data={d.expenseTimeline} color={chartColors.danger} height={200} />
          </ChartCard>
          <div>
            <h4 className="text-xs font-medium text-surface-500 uppercase mb-3">Top Categories</h4>
            <div className="space-y-2">
              {d.expenses.topCategories.map((cat) => (
                <div key={cat.subcategory} className="flex items-center justify-between">
                  <span className="text-xs text-surface-700">{cat.subcategory}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-surface-400"
                        style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-surface-900 w-14 text-right">
                      {formatCompactCurrency(cat.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ReportSection>
    ),
    "cash-runway-section": (
      <ReportSection
        title="Cash & Runway"
        narrative={generateCashNarrative(d.cash)}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
          <ChartCard title="Cash Position" subtitle="Monthly ending cash balance">
            <AreaChartWidget data={d.cashTimeline} color={chartColors.success} height={200} />
          </ChartCard>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-[10px] font-medium text-surface-500 uppercase">Cash Position</p>
                <p className="text-lg font-bold text-surface-900 tabular-nums">{formatCompactCurrency(d.cash.position)}</p>
              </div>
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-[10px] font-medium text-surface-500 uppercase">Net Burn Rate</p>
                <p className="text-lg font-bold text-surface-900 tabular-nums">{formatCompactCurrency(d.cash.burnRate)}/mo</p>
              </div>
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-[10px] font-medium text-surface-500 uppercase">Runway</p>
                <p className="text-lg font-bold text-surface-900 tabular-nums">
                  {d.cash.runway > 36 ? "36+" : Math.round(d.cash.runway)} mo
                </p>
              </div>
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-[10px] font-medium text-surface-500 uppercase">Total Raised</p>
                <p className="text-lg font-bold text-surface-900 tabular-nums">{formatCompactCurrency(d.cash.totalFunding)}</p>
              </div>
            </div>
          </div>
        </div>
      </ReportSection>
    ),
    "pnl-table": (
      <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden print:break-inside-avoid">
        <div className="px-6 py-4 border-b border-surface-200 bg-surface-50">
          <h2 className="text-lg font-semibold text-surface-900">P&L Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th scope="col" className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Line Item</th>
                {d.pnlSummary.revenue.slice(-6).map((pt) => (
                  <th key={pt.month} scope="col" className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase">
                    {formatShortMonth(pt.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              <PnlRow label="Revenue" values={d.pnlSummary.revenue} bold />
              <PnlRow label="COGS" values={d.pnlSummary.cogs} indent />
              <PnlRow label="Gross Profit" values={d.pnlSummary.grossProfit} bold />
              <PnlRow label="Operating Expenses" values={d.pnlSummary.opex} indent />
              <PnlRow label="Net Income" values={d.pnlSummary.netIncome} bold highlight />
            </tbody>
          </table>
        </div>
      </div>
    ),
  }), [d]);

  return (
    <PageLayoutProvider pageId="reports/board-update">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="reports/board-update">
          <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-3">
                <Link
                  href="/reports"
                  className="rounded-lg p-1.5 hover:bg-surface-100 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-surface-500" />
                </Link>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Board Update</h1>
                  <p className="mt-0.5 text-sm text-surface-500">
                    {d.companyName} &mdash; {formatMonthYear(d.reportMonth)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <Link
                  href="/data-room"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Package
                </Link>
              </div>
            </div>

            {/* Print header */}
            <div className="hidden print:block print:mb-8">
              <h1 className="text-3xl font-bold text-surface-900">{d.companyName}</h1>
              <p className="text-lg text-surface-600 mt-1">
                Monthly Board Update — {formatMonthYear(d.reportMonth)}
              </p>
              <div className="h-1 w-16 bg-brand-600 mt-3 rounded-full" />
            </div>

            <BoardUpdatePageGrid
              widgets={widgets}
              defaultLayoutLG={defaultLayoutLG}
              defaultLayoutSM={defaultLayoutSM}
            />

            {/* Footer */}
            <div className="text-center text-[10px] text-surface-400 pt-4 print:pt-8">
              Generated by Burnless &mdash; {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </PageProvider>
      </ComputedMetricsProvider>
    </PageLayoutProvider>
  );
}

function BoardUpdatePageGrid({
  widgets,
  defaultLayoutLG,
  defaultLayoutSM,
}: {
  widgets: Record<string, ReactNode>;
  defaultLayoutLG: DefaultLayoutItem[];
  defaultLayoutSM: DefaultLayoutItem[];
}) {
  const layout = usePageLayoutContext();
  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      defaultLayoutSM={defaultLayoutSM}
      savedLayout={layout.savedLayout}
      onLayoutChange={layout.onLayoutChange}
      closedWidgets={layout.closedWidgets}
      onCloseWidget={layout.onCloseWidget}
      onOpenWidget={layout.onOpenWidget}
      onReset={layout.onReset}
      widgetReadiness={layout.widgetReadiness}
      isLoading={layout.isLoading}
      isEditMode={layout.isEditMode}
      setIsEditMode={layout.setIsEditMode}
    />
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function PnlRow({
  label,
  values,
  bold,
  indent,
  highlight,
}: {
  label: string;
  values: MetricPoint[];
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
}) {
  const last6 = values.slice(-6);
  return (
    <tr className={highlight ? "bg-surface-50" : ""}>
      <td className={`px-6 py-2.5 text-sm ${bold ? "font-semibold text-surface-900" : "text-surface-700"} ${indent ? "pl-10" : ""}`}>
        {label}
      </td>
      {last6.map((pt) => (
        <td
          key={pt.month}
          className={`px-4 py-2.5 text-right text-sm tabular-nums ${
            bold ? "font-semibold text-surface-900" : "text-surface-700"
          } ${highlight && pt.value < 0 ? "text-red-600" : highlight && pt.value > 0 ? "text-green-600" : ""}`}
        >
          {highlight && pt.value !== 0 && <span className="sr-only">{pt.value > 0 ? "Profit" : "Loss"}:</span>}
          {formatCompactCurrency(pt.value)}
        </td>
      ))}
    </tr>
  );
}

function formatShortMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short" });
}
