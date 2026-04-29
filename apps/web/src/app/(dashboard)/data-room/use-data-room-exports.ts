"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/components/ui/toast";
import { usePlanLimit } from "@/hooks/use-plan-limit";
import { useLocale } from "@/components/locale/locale-context";
import { formatCompactAmount } from "@burnless/types";
import type { DataRoomViewProps } from "./data-room-config";
import { exportItems, reportSections } from "./data-room-config";

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function useDataRoomExports(props: DataRoomViewProps) {
  const {
    companyName, scenarioName, profitAndLoss, cashFlow, balanceSheet,
    keyMetrics, fundingRounds, startingCash, netBurnRate, runwayMonths,
  } = props;

  const { currency, locale } = useLocale();
  const fmtAmount = useCallback(
    (value: number) => formatCompactAmount(value, currency, locale),
    [currency, locale],
  );

  const { success: toastSuccess, error: toastError } = useToast();
  const { planLimit, checkErrorBody, clearLimit } = usePlanLimit();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());
  const [builderSections, setBuilderSections] = useState<Set<string>>(
    new Set(reportSections.map((s) => s.id))
  );

  const opts = { companyName, scenarioName, title: "" };

  const handleExport = async (id: string) => {
    setExporting(id);
    clearLimit();
    await new Promise((r) => setTimeout(r, 100));

    try {
      const format = id.endsWith("-csv") ? "csv" : "pdf";
      const gateRes = await apiFetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportType: id, format }),
      });
      if (gateRes.status === 403) {
        const body = await gateRes.json().catch(() => ({}));
        if (body.code === "PLAN_LIMIT_REACHED" && body.upgradeTarget) {
          checkErrorBody(403, body);
          return;
        }
        toastError("Export limit reached", { description: body.error ?? "Upgrade your plan for more exports." });
        return;
      }

      switch (id) {
        case "full-deck": {
          const { generateInvestorDataRoomPDF, downloadPDF } = await import("@/lib/pdf-export");
          const doc = await generateInvestorDataRoomPDF({
            companyName, scenarioName, profitAndLoss, cashFlow,
            balanceSheet, keyMetrics, startingCash, netBurnRate, runwayMonths,
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

  return {
    exporting,
    exported,
    builderSections,
    planLimit,
    clearLimit,
    handleExport,
    handleExportAll,
    handleBuildReport,
    toggleBuilderSection,
  };
}
