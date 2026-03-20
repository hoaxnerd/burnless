"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText, Table, FolderOpen, Check, Loader2 } from "lucide-react";
import type { ProfitAndLoss, CashFlowStatement, BalanceSheet } from "@burnless/engine";
import {
  generateInvestorDataRoomPDF,
  generateProfitLossPDF,
  generateCashFlowPDF,
  generateBalanceSheetPDF,
  generateRunwaySummaryPDF,
  downloadPDF,
} from "@/lib/pdf-export";

interface DataRoomViewProps {
  companyName: string;
  scenarioName: string;
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

const exportItems: ExportItem[] = [
  { id: "full-deck", label: "Full Financial Package", description: "Complete investor data room with all statements and metrics", format: "pdf", icon: FolderOpen },
  { id: "pnl", label: "Profit & Loss", description: "Income statement with revenue, expenses, and margins", format: "pdf", icon: FileText },
  { id: "cashflow", label: "Cash Flow Statement", description: "Operating, investing, and financing cash flows", format: "pdf", icon: FileText },
  { id: "balance", label: "Balance Sheet", description: "Assets, liabilities, and equity", format: "pdf", icon: FileText },
  { id: "runway", label: "Runway Summary", description: "Cash position, burn rate, and runway projections", format: "pdf", icon: FileText },
  { id: "metrics-csv", label: "Key Metrics (CSV)", description: "All financial metrics in spreadsheet format", format: "csv", icon: Table },
  { id: "funding-csv", label: "Funding History (CSV)", description: "Funding rounds, amounts, and valuations", format: "csv", icon: Table },
];

export function DataRoomView({
  companyName,
  scenarioName,
  profitAndLoss,
  cashFlow,
  balanceSheet,
  keyMetrics,
  fundingRounds,
  startingCash,
  netBurnRate,
  runwayMonths,
}: DataRoomViewProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());

  const opts = { companyName, scenarioName, title: "" };

  const handleExport = async (id: string) => {
    setExporting(id);
    // Small delay for UX feedback
    await new Promise((r) => setTimeout(r, 100));

    try {
      switch (id) {
        case "full-deck": {
          const doc = generateInvestorDataRoomPDF({
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
          const doc = generateProfitLossPDF(profitAndLoss, { ...opts, title: "Profit & Loss Statement" });
          downloadPDF(doc, "profit-and-loss");
          break;
        }
        case "cashflow": {
          const doc = generateCashFlowPDF(cashFlow, { ...opts, title: "Cash Flow Statement" });
          downloadPDF(doc, "cash-flow");
          break;
        }
        case "balance": {
          const doc = generateBalanceSheetPDF(balanceSheet, { ...opts, title: "Balance Sheet" });
          downloadPDF(doc, "balance-sheet");
          break;
        }
        case "runway": {
          const cashPosition = cashFlow.endingCash;
          const doc = generateRunwaySummaryPDF(
            { startingCash, netBurnRate, grossBurnRate: 0, runwayMonths, cashPosition },
            { ...opts, title: "Runway Summary" }
          );
          downloadPDF(doc, "runway-summary");
          break;
        }
        case "metrics-csv": {
          const headers = ["Category", "Metric", "Value"];
          const rows = [headers.join(","), ...keyMetrics.map((m) => `${m.category},${m.label},${m.value}`)];
          downloadCSV(rows.join("\n"), "key-metrics");
          break;
        }
        case "funding-csv": {
          const headers = ["Round", "Amount", "Date", "Pre-Money Valuation"];
          const rows = [
            headers.join(","),
            ...fundingRounds.map((r) =>
              [r.round, r.amount, r.date, r.valuation ?? "N/A"].join(",")
            ),
          ];
          downloadCSV(rows.join("\n"), "funding-rounds");
          break;
        }
      }

      setExported((prev) => new Set(prev).add(id));
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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Investor Data Room</h1>
          <p className="mt-1 text-sm text-surface-500">
            One-click export of your financial data for investors &mdash; {companyName}, {scenarioName} scenario
          </p>
        </div>
        <button
          onClick={handleExportAll}
          disabled={!!exporting}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download All
        </button>
      </div>

      {/* Key metrics preview */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-surface-900 mb-4">Financial Snapshot</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {keyMetrics.map((m) => (
            <div key={m.label}>
              <p className="text-xs text-surface-500">{m.label}</p>
              <p className="text-lg font-bold text-surface-900">{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Export items */}
      <div className="space-y-3">
        {exportItems.map((item) => {
          const Icon = item.icon;
          const isExporting = exporting === item.id;
          const isExported = exported.has(item.id);
          const isPrimary = item.id === "full-deck";

          return (
            <div
              key={item.id}
              className={`rounded-xl bg-surface-0 border p-4 flex items-center justify-between transition-colors ${
                isPrimary ? "border-brand-200 bg-brand-50/30" : "border-surface-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  item.format === "pdf"
                    ? "bg-red-50 text-red-500"
                    : "bg-green-50 text-green-500"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">{item.label}</p>
                  <p className="text-xs text-surface-500">{item.description}</p>
                </div>
              </div>

              <button
                onClick={() => handleExport(item.id)}
                disabled={isExporting}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isExported
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : isPrimary
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "border border-surface-200 text-surface-600 hover:bg-surface-50"
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

      {/* Funding history */}
      {fundingRounds.length > 0 && (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6 mt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Funding History</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2 text-xs font-medium text-surface-500 uppercase">Round</th>
                <th className="text-right py-2 text-xs font-medium text-surface-500 uppercase">Amount</th>
                <th className="text-right py-2 text-xs font-medium text-surface-500 uppercase">Date</th>
                <th className="text-right py-2 text-xs font-medium text-surface-500 uppercase">Valuation</th>
              </tr>
            </thead>
            <tbody>
              {fundingRounds.map((r, i) => (
                <tr key={i} className="border-b border-surface-100">
                  <td className="py-2 capitalize text-surface-900">{r.round.replace(/_/g, " ")}</td>
                  <td className="py-2 text-right text-surface-700">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(r.amount)}
                  </td>
                  <td className="py-2 text-right text-surface-500">{r.date}</td>
                  <td className="py-2 text-right text-surface-500">
                    {r.valuation
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(r.valuation)
                      : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
