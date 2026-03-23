"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Download, FileText, Table, FolderOpen, Check, Loader2,
  FileBarChart, Upload, BarChart3, TrendingUp, Wallet,
  Timer, Target, LayoutGrid, Shuffle, Zap, ChevronRight,
} from "lucide-react";
import type { ProfitAndLoss, CashFlowStatement, BalanceSheet } from "@burnless/engine";
import { useToast } from "@/components/ui/toast";
import { ImportFlow } from "../import/import-flow";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface DataRoomViewProps {
  companyName: string;
  scenarioName: string;
  scenarioAvailable: boolean;
  profitAndLoss: ProfitAndLoss;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  keyMetrics: Array<{ label: string; value: string; category: string }>;
  fundingRounds: Array<{ round: string; amount: number; date: string; valuation: number | null }>;
  startingCash: number;
  netBurnRate: number;
  runwayMonths: number;
}

interface ExportItem {
  id: string;
  label: string;
  description: string;
  format: "pdf" | "csv";
  icon: typeof FileText;
}

type TabId = "reports" | "exports" | "import";

/* ── Tab definitions ────────────────────────────────────────────────────────── */

const tabs: Array<{ id: TabId; label: string; icon: typeof FileBarChart }> = [
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "exports", label: "Exports", icon: Download },
  { id: "import", label: "Import", icon: Upload },
];

/* ── Report definitions ─────────────────────────────────────────────────────── */

const reports = [
  {
    id: "board-update",
    title: "Board Update",
    description: "Investor-ready monthly report with AI narratives and key metrics",
    href: "/reports/board-update",
    icon: FileBarChart,
    featured: true,
    color: "from-brand-500 to-indigo-500",
  },
  {
    id: "profit-loss",
    title: "Profit & Loss",
    description: "Income, expenses, and net profit over time",
    href: "/reports/profit-loss",
    icon: TrendingUp,
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: "cash-flow",
    title: "Cash Flow",
    description: "Cash inflows, outflows, and net position",
    href: "/reports/cash-flow",
    icon: Wallet,
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: "balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity snapshot",
    href: "/reports/balance-sheet",
    icon: BarChart3,
    color: "from-violet-500 to-purple-500",
  },
  {
    id: "runway",
    title: "Runway Analysis",
    description: "How long your cash will last at current burn",
    href: "/reports/runway",
    icon: Timer,
    color: "from-orange-500 to-amber-500",
  },
  {
    id: "budget-vs-actuals",
    title: "Budget vs Actuals",
    description: "Compare planned vs actual spending",
    href: "/reports/budget-vs-actuals",
    icon: Target,
    color: "from-rose-500 to-pink-500",
  },
  {
    id: "metrics",
    title: "Metrics Explorer",
    description: "Browse all 60+ financial and SaaS metrics",
    href: "/reports/metrics",
    icon: LayoutGrid,
    color: "from-sky-500 to-blue-500",
  },
  {
    id: "scenario-compare",
    title: "Scenario Comparison",
    description: "Compare two scenarios side by side with delta analysis",
    href: "/reports/scenario-compare",
    icon: Shuffle,
    color: "from-fuchsia-500 to-pink-500",
  },
];

/* ── Export items ────────────────────────────────────────────────────────────── */

const exportItems: ExportItem[] = [
  { id: "full-deck", label: "Full Financial Package", description: "Complete investor data room with all statements and metrics", format: "pdf", icon: FolderOpen },
  { id: "pnl", label: "Profit & Loss", description: "Income statement with revenue, expenses, and margins", format: "pdf", icon: FileText },
  { id: "cashflow", label: "Cash Flow Statement", description: "Operating, investing, and financing cash flows", format: "pdf", icon: FileText },
  { id: "balance", label: "Balance Sheet", description: "Assets, liabilities, and equity", format: "pdf", icon: FileText },
  { id: "runway", label: "Runway Summary", description: "Cash position, burn rate, and runway projections", format: "pdf", icon: FileText },
  { id: "pnl-csv", label: "Profit & Loss (CSV)", description: "Full P&L with monthly breakdown by account", format: "csv", icon: Table },
  { id: "cashflow-csv", label: "Cash Flow (CSV)", description: "Cash flow statement with monthly columns", format: "csv", icon: Table },
  { id: "balance-csv", label: "Balance Sheet (CSV)", description: "Assets, liabilities, and equity monthly breakdown", format: "csv", icon: Table },
  { id: "metrics-csv", label: "Key Metrics (CSV)", description: "All financial metrics in spreadsheet format", format: "csv", icon: Table },
  { id: "funding-csv", label: "Funding History (CSV)", description: "Funding rounds, amounts, and valuations", format: "csv", icon: Table },
];

/* ── Report Builder sections ────────────────────────────────────────────────── */

const reportSections = [
  { id: "snapshot", label: "Financial Snapshot", description: "Key metrics overview", exportIds: ["metrics-csv"] },
  { id: "pnl", label: "Profit & Loss", description: "Revenue & expenses", exportIds: ["pnl", "pnl-csv"] },
  { id: "cashflow", label: "Cash Flow", description: "Inflows & outflows", exportIds: ["cashflow", "cashflow-csv"] },
  { id: "balance", label: "Balance Sheet", description: "Assets & liabilities", exportIds: ["balance", "balance-csv"] },
  { id: "runway", label: "Runway Analysis", description: "Burn & runway", exportIds: ["runway"] },
  { id: "funding", label: "Funding History", description: "Rounds & valuations", exportIds: ["funding-csv"] },
];

/* ── Main Component ─────────────────────────────────────────────────────────── */

export function DataRoomView({
  companyName,
  scenarioName,
  scenarioAvailable,
  profitAndLoss,
  cashFlow,
  balanceSheet,
  keyMetrics,
  fundingRounds,
  startingCash,
  netBurnRate,
  runwayMonths,
}: DataRoomViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const initialTab = (searchParams.get("tab") as TabId) || "reports";
  const [activeTab, setActiveTab] = useState<TabId>(
    tabs.some((t) => t.id === initialTab) ? initialTab : "reports"
  );

  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());
  const [builderSections, setBuilderSections] = useState<Set<string>>(
    new Set(reportSections.map((s) => s.id))
  );

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  /* ── Export logic ─────────────────────────────────────────────────────────── */

  const opts = { companyName, scenarioName, title: "" };

  const handleExport = async (id: string) => {
    setExporting(id);
    await new Promise((r) => setTimeout(r, 100));

    try {
      // Check export limit and record usage
      const format = id.endsWith("-csv") ? "csv" : "pdf";
      const gateRes = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportType: id, format }),
      });
      if (gateRes.status === 403) {
        const { error } = await gateRes.json();
        toastError("Export limit reached", { description: error ?? "Upgrade your plan for more exports." });
        return;
      }

      switch (id) {
        case "full-deck": {
          const { generateInvestorDataRoomPDF, downloadPDF } = await import("@/lib/pdf-export");
          const doc = await generateInvestorDataRoomPDF({
            companyName,
            scenarioName,
            profitAndLoss,
            cashFlow,
            balanceSheet,
            keyMetrics,
            startingCash,
            netBurnRate,
            runwayMonths,
          });
          downloadPDF(doc, `${companyName.toLowerCase().replace(/\s+/g, "-")}-data-room`);
          break;
        }
        case "pnl": {
          const { generateProfitLossPDF, downloadPDF } = await import("@/lib/pdf-export");
          const doc = await generateProfitLossPDF(profitAndLoss, { ...opts, title: "Profit & Loss Statement" });
          downloadPDF(doc, "profit-and-loss");
          break;
        }
        case "cashflow": {
          const { generateCashFlowPDF, downloadPDF } = await import("@/lib/pdf-export");
          const doc = await generateCashFlowPDF(cashFlow, { ...opts, title: "Cash Flow Statement" });
          downloadPDF(doc, "cash-flow");
          break;
        }
        case "balance": {
          const { generateBalanceSheetPDF, downloadPDF } = await import("@/lib/pdf-export");
          const doc = await generateBalanceSheetPDF(balanceSheet, { ...opts, title: "Balance Sheet" });
          downloadPDF(doc, "balance-sheet");
          break;
        }
        case "runway": {
          const { generateRunwaySummaryPDF, downloadPDF } = await import("@/lib/pdf-export");
          const cashPosition = cashFlow.endingCash;
          const doc = await generateRunwaySummaryPDF(
            { startingCash, netBurnRate, grossBurnRate: 0, runwayMonths, cashPosition },
            { ...opts, title: "Runway Summary" }
          );
          downloadPDF(doc, "runway-summary");
          break;
        }
        case "pnl-csv": {
          const { generateStatementCSV, downloadCSV: dlCSV } = await import("@/lib/excel-export");
          const pnlMonths = profitAndLoss.revenue.values.map((v) => v.month);
          const csv = generateStatementCSV(
            { title: "Profit & Loss Statement", companyName, scenarioName, months: pnlMonths },
            [
              { name: "Revenue", items: [profitAndLoss.revenue] },
              { name: "Cost of Goods Sold", items: [profitAndLoss.cogs] },
              { name: "Gross Profit", items: [profitAndLoss.grossProfit] },
              { name: "Operating Expenses", items: [profitAndLoss.operatingExpenses] },
              { name: "Operating Income", items: [profitAndLoss.operatingIncome] },
              { name: "Other Income", items: [profitAndLoss.otherIncome] },
              { name: "Other Expenses", items: [profitAndLoss.otherExpenses] },
              { name: "Net Income", items: [profitAndLoss.netIncome] },
            ]
          );
          dlCSV(csv, "profit-and-loss");
          break;
        }
        case "cashflow-csv": {
          const { generateStatementCSV: genCSV, downloadCSV: dlCSV2 } = await import("@/lib/excel-export");
          const cfMonths = cashFlow.operatingCashFlow.values.map((v) => v.month);
          const csv = genCSV(
            { title: "Cash Flow Statement", companyName, scenarioName, months: cfMonths },
            [
              { name: "Operating Cash Flow", items: [cashFlow.operatingCashFlow] },
              { name: "Investing Cash Flow", items: [cashFlow.investingCashFlow] },
              { name: "Financing Cash Flow", items: [cashFlow.financingCashFlow] },
              { name: "Net Cash Change", items: [cashFlow.netCashChange] },
              { name: "Ending Cash Position", items: [{ name: "Ending Cash", values: cashFlow.endingCash }] },
            ]
          );
          dlCSV2(csv, "cash-flow");
          break;
        }
        case "balance-csv": {
          const { generateStatementCSV: genBSCSV, downloadCSV: dlCSV3 } = await import("@/lib/excel-export");
          const bsMonths = balanceSheet.assets.values.map((v) => v.month);
          const csv = genBSCSV(
            { title: "Balance Sheet", companyName, scenarioName, months: bsMonths },
            [
              { name: "Assets", items: [balanceSheet.assets] },
              { name: "Liabilities", items: [balanceSheet.liabilities] },
              { name: "Equity", items: [balanceSheet.equity] },
            ]
          );
          dlCSV3(csv, "balance-sheet");
          break;
        }
        case "metrics-csv": {
          const lines: string[] = [];
          lines.push(`Key Financial Metrics`);
          lines.push(`Company: ${companyName}`);
          lines.push(`Scenario: ${scenarioName}`);
          lines.push(`Generated: ${new Date().toLocaleDateString()}`);
          lines.push(``);
          lines.push("Category,Metric,Value");
          for (const m of keyMetrics) {
            lines.push(`${m.category},${m.label},"${m.value}"`);
          }
          lines.push(``);
          lines.push("Summary");
          lines.push(`Starting Cash,${startingCash}`);
          lines.push(`Net Burn Rate,${netBurnRate}`);
          lines.push(`Runway (months),${runwayMonths >= 999 ? "36+" : Math.round(runwayMonths)}`);
          lines.push(`Funding Rounds,${fundingRounds.length}`);
          lines.push(`Total Funding Raised,${fundingRounds.reduce((s, r) => s + r.amount, 0)}`);
          downloadCSV(lines.join("\n"), "key-metrics");
          break;
        }
        case "funding-csv": {
          const fmtAmount = (v: number) => {
            if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
            if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
            return `$${v.toFixed(0)}`;
          };
          const lines: string[] = [];
          lines.push(`Funding History`);
          lines.push(`Company: ${companyName}`);
          lines.push(`Generated: ${new Date().toLocaleDateString()}`);
          lines.push(``);
          lines.push("Round,Amount,Formatted Amount,Date,Pre-Money Valuation");
          for (const r of fundingRounds) {
            lines.push(`${r.round},${r.amount},"${fmtAmount(r.amount)}",${r.date},${r.valuation ?? "N/A"}`);
          }
          lines.push(``);
          lines.push(`Total Rounds,${fundingRounds.length}`);
          lines.push(`Total Raised,${fundingRounds.reduce((s, r) => s + r.amount, 0)},"${fmtAmount(fundingRounds.reduce((s, r) => s + r.amount, 0))}"`);
          downloadCSV(lines.join("\n"), "funding-rounds");
          break;
        }
      }
      setExported((prev) => new Set(prev).add(id));
      toastSuccess("Export complete", { description: `${id === "full-deck" ? "Full Financial Package" : id} downloaded.` });
    } catch (err) {
      console.error("Export failed:", err);
      toastError("Export failed", { description: err instanceof Error ? err.message : "An unexpected error occurred. Please try again." });
    } finally {
      setExporting(null);
    }
  };

  const handleExportAll = async () => {
    for (const item of exportItems) {
      await handleExport(item.id);
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const handleBuildReport = async () => {
    const selectedExportIds = reportSections
      .filter((s) => builderSections.has(s.id))
      .flatMap((s) => s.exportIds);
    const uniqueIds = [...new Set(selectedExportIds)];
    for (const id of uniqueIds) {
      await handleExport(id);
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const toggleBuilderSection = (id: string) => {
    setBuilderSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── Count badges ─────────────────────────────────────────────────────────── */

  const tabBadges = useMemo(() => ({
    reports: reports.length,
    exports: exportItems.length,
    import: null,
  }), []);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-surface-50">
            Data Room
          </h1>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            Reports, exports, and data imports &mdash; {companyName}
          </p>
        </div>
        {activeTab === "exports" && (
          <button
            onClick={handleExportAll}
            disabled={!!exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors flex-shrink-0 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-100 dark:bg-surface-800 mb-6 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-surface-0 dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm"
                  : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tabBadges[tab.id] && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? "bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400"
                    : "bg-surface-200 dark:bg-surface-700 text-surface-500 dark:text-surface-400"
                }`}>
                  {tabBadges[tab.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "reports" && (
        <ReportsTab scenarioAvailable={scenarioAvailable} />
      )}
      {activeTab === "exports" && (
        <ExportsTab
          keyMetrics={keyMetrics}
          fundingRounds={fundingRounds}
          exportItems={exportItems}
          exporting={exporting}
          exported={exported}
          onExport={handleExport}
          builderSections={builderSections}
          onToggleBuilderSection={toggleBuilderSection}
          onBuildReport={handleBuildReport}
          scenarioName={scenarioName}
        />
      )}
      {activeTab === "import" && <ImportFlow embedded />}
    </div>
  );
}

/* ── Reports Tab ────────────────────────────────────────────────────────────── */

function ReportsTab({ scenarioAvailable }: { scenarioAvailable: boolean }) {
  return (
    <div>
      {/* Report cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.id}
              href={scenarioAvailable ? report.href : "#"}
              className={`group relative rounded-xl border p-5 transition-all ${
                report.featured
                  ? "border-brand-200 dark:border-brand-800 bg-gradient-to-br from-brand-50/50 to-indigo-50/30 dark:from-brand-950/30 dark:to-indigo-950/20 sm:col-span-2 lg:col-span-1"
                  : "border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800"
              } ${
                scenarioAvailable
                  ? "hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 hover:-translate-y-0.5"
                  : "opacity-60 pointer-events-none"
              }`}
            >
              {/* Gradient accent bar */}
              <div className={`absolute top-0 left-4 right-4 h-0.5 rounded-full bg-gradient-to-r ${report.color} opacity-0 group-hover:opacity-100 transition-opacity`} />

              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${report.color} flex items-center justify-center mb-3 shadow-sm`}>
                <Icon className="w-5 h-5 text-white" />
              </div>

              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-1">
                {report.title}
              </h3>
              <p className="text-xs text-surface-500 dark:text-surface-400 mb-3 line-clamp-2">
                {report.description}
              </p>

              {scenarioAvailable ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 group-hover:gap-2 transition-all">
                  <Zap className="w-3 h-3" />
                  Generate report
                  <ChevronRight className="w-3 h-3" />
                </span>
              ) : (
                <span className="text-xs font-medium text-surface-400 dark:text-surface-500">
                  Create a scenario first
                </span>
              )}

              {report.featured && (
                <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full">
                  Featured
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Exports Tab ────────────────────────────────────────────────────────────── */

function ExportsTab({
  keyMetrics,
  fundingRounds,
  exportItems,
  exporting,
  exported,
  onExport,
  builderSections,
  onToggleBuilderSection,
  onBuildReport,
  scenarioName,
}: {
  keyMetrics: DataRoomViewProps["keyMetrics"];
  fundingRounds: DataRoomViewProps["fundingRounds"];
  exportItems: ExportItem[];
  exporting: string | null;
  exported: Set<string>;
  onExport: (id: string) => void;
  builderSections: Set<string>;
  onToggleBuilderSection: (id: string) => void;
  onBuildReport: () => void;
  scenarioName: string;
}) {
  return (
    <div className="space-y-6">
      {/* Financial snapshot */}
      <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Financial Snapshot</h2>
          <span className="text-xs text-surface-400 dark:text-surface-500">{scenarioName} scenario</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {keyMetrics.map((m) => (
            <div key={m.label} className="rounded-lg bg-surface-50 dark:bg-surface-750 p-3">
              <p className="text-[11px] font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">{m.label}</p>
              <p className="text-lg font-bold text-surface-900 dark:text-surface-50 mt-0.5">{m.value}</p>
              <p className="text-[10px] text-surface-400 dark:text-surface-500">{m.category}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Export items */}
      <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
        <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-4">Quick Exports</h2>
        <div className="space-y-2">
          {exportItems.map((item) => {
            const Icon = item.icon;
            const isExporting = exporting === item.id;
            const isExported = exported.has(item.id);
            const isPrimary = item.id === "full-deck";

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 flex items-center justify-between transition-colors ${
                  isPrimary
                    ? "border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-950/20"
                    : "border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    item.format === "pdf"
                      ? "bg-red-50 dark:bg-red-950/30 text-red-500"
                      : "bg-green-50 dark:bg-green-950/30 text-green-500"
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-50">{item.label}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">{item.description}</p>
                  </div>
                </div>

                <button
                  onClick={() => onExport(item.id)}
                  disabled={isExporting}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isExported
                      ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                      : isPrimary
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700"
                  }`}
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isExported ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {isExporting ? "Generating..." : isExported ? "Downloaded" : `Export ${item.format.toUpperCase()}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Report Builder */}
      <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Custom Report Builder</h2>
          <span className="text-xs text-surface-400 dark:text-surface-500">{builderSections.size} of {reportSections.length} selected</span>
        </div>
        <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Select sections to include in your custom report package
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {reportSections.map((section) => {
            const isSelected = builderSections.has(section.id);
            return (
              <button
                key={section.id}
                onClick={() => onToggleBuilderSection(section.id)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-brand-300 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-950/20"
                    : "border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600"
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                  isSelected
                    ? "border-brand-500 bg-brand-500"
                    : "border-surface-300 dark:border-surface-600"
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900 dark:text-surface-50">{section.label}</p>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400">{section.description}</p>
                </div>
              </button>
            );
          })}
        </div>
        <button
          onClick={onBuildReport}
          disabled={builderSections.size === 0 || !!exporting}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Zap className="w-4 h-4" />
          Generate Custom Report
          {builderSections.size > 0 && (
            <span className="text-xs text-brand-200">({builderSections.size} sections)</span>
          )}
        </button>
      </div>

      {/* Funding history */}
      {fundingRounds.length > 0 && (
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
          <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-4">Funding History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 dark:border-surface-700">
                  <th scope="col" className="text-left py-2 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Round</th>
                  <th scope="col" className="text-right py-2 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Amount</th>
                  <th scope="col" className="text-right py-2 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Date</th>
                  <th scope="col" className="text-right py-2 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Valuation</th>
                </tr>
              </thead>
              <tbody>
                {fundingRounds.map((r, i) => (
                  <tr key={i} className="border-b border-surface-100 dark:border-surface-700/50">
                    <td className="py-2.5 capitalize text-surface-900 dark:text-surface-50 font-medium">{r.round.replace(/_/g, " ")}</td>
                    <td className="py-2.5 text-right text-surface-700 dark:text-surface-300">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(r.amount)}
                    </td>
                    <td className="py-2.5 text-right text-surface-500 dark:text-surface-400">{r.date}</td>
                    <td className="py-2.5 text-right text-surface-500 dark:text-surface-400">
                      {r.valuation
                        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(r.valuation)
                        : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
