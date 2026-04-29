"use client";

import { Download, Check, Loader2, Zap } from "lucide-react";
import { useLocale } from "@/components/locale/locale-context";
import type { DataRoomViewProps, ExportItem } from "./data-room-config";
import { reportSections } from "./data-room-config";

interface ExportsTabProps {
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
}

export function ExportsTab({
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
}: ExportsTabProps) {
  const { fmtCurrency } = useLocale();

  return (
    <div className="space-y-6">
      {/* TODO: Financial Snapshot — future release */}

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
                      {fmtCurrency(r.amount, { decimals: 0 })}
                    </td>
                    <td className="py-2.5 text-right text-surface-500 dark:text-surface-400">{r.date}</td>
                    <td className="py-2.5 text-right text-surface-500 dark:text-surface-400">
                      {r.valuation
                        ? fmtCurrency(r.valuation, { decimals: 0 })
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
