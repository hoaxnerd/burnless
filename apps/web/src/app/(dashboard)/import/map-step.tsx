"use client";

import { Sparkles, Check, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { confidenceColor, confidenceLabel } from "./import-utils";
import type { ParsedRow, ColumnMapping, MappingConfidence, AccountOption } from "./import-utils";

interface MapStepProps {
  fileName: string;
  rows: ParsedRow[];
  headers: string[];
  mapping: ColumnMapping;
  setMapping: React.Dispatch<React.SetStateAction<ColumnMapping>>;
  mappingConfidence: MappingConfidence;
  setMappingConfidence: React.Dispatch<React.SetStateAction<MappingConfidence>>;
  targetAccountId: string;
  setTargetAccountId: (id: string) => void;
  accounts: AccountOption[];
  loading: boolean;
  reset: () => void;
  generatePreview: () => void;
}

export function MapStep({
  fileName,
  rows,
  headers,
  mapping,
  setMapping,
  mappingConfidence,
  setMappingConfidence,
  targetAccountId,
  setTargetAccountId,
  accounts,
  loading,
  reset,
  generatePreview,
}: MapStepProps) {
  return (
    <div className="max-w-3xl space-y-6 animate-slide-up">
      <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">{fileName}</h3>
            <p className="text-xs text-surface-500 mt-0.5">
              {rows.length} rows &middot; {headers.length} columns detected
            </p>
          </div>
          {(mappingConfidence.date > 0 || mappingConfidence.amount > 0) && (
            <div className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400">
              <Sparkles className="h-3.5 w-3.5" />
              AI auto-mapped columns
            </div>
          )}
        </div>

        <div className="space-y-4">
          {([
            { key: "date" as const, label: "Date column", required: true },
            { key: "amount" as const, label: "Amount column", required: true },
            { key: "description" as const, label: "Description column", required: false },
            { key: "category" as const, label: "Category column", required: false },
          ] as const).map(({ key, label, required }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  {label}{" "}
                  {required ? (
                    <span className="text-danger-500">*</span>
                  ) : (
                    <span className="text-surface-400">(optional)</span>
                  )}
                </label>
                {mapping[key] && mappingConfidence[key] > 0 && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceColor(mappingConfidence[key])}`}>
                    {mappingConfidence[key] >= 0.8 ? <Check className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                    {confidenceLabel(mappingConfidence[key])}
                  </span>
                )}
              </div>
              <select
                value={mapping[key]}
                onChange={(e) => {
                  setMapping((m) => ({ ...m, [key]: e.target.value }));
                  setMappingConfidence((c) => ({ ...c, [key]: e.target.value ? 1 : 0 }));
                }}
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-surface-0 dark:bg-surface-900 text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                  mapping[key] && mappingConfidence[key] >= 0.8
                    ? "border-success-300 dark:border-success-700"
                    : mapping[key] && mappingConfidence[key] >= 0.5
                      ? "border-warning-300 dark:border-warning-700"
                      : "border-surface-300 dark:border-surface-600"
                }`}
              >
                <option value="">{required ? "Select column..." : "None"}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}

          {/* Target account */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              Import into account <span className="text-danger-500">*</span>
            </label>
            <select
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.category})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sample data preview */}
      {mapping.date && mapping.amount && (
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-3">
            Sample data (first 5 rows)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 dark:border-surface-700">
                  <th scope="col" className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Date</th>
                  <th scope="col" className="text-right py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Amount</th>
                  <th scope="col" className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Description</th>
                  {mapping.category && (
                    <th scope="col" className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Category</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-surface-100 dark:border-surface-700/50">
                    <td className="py-2 px-3 text-surface-900 dark:text-surface-50">{row[mapping.date] || "\u2014"}</td>
                    <td className="py-2 px-3 text-right font-mono text-surface-900 dark:text-surface-50">{row[mapping.amount] || "\u2014"}</td>
                    <td className="py-2 px-3 text-surface-600 dark:text-surface-400 max-w-xs truncate">
                      {mapping.description ? row[mapping.description] || "\u2014" : "\u2014"}
                    </td>
                    {mapping.category && (
                      <td className="py-2 px-3 text-surface-600 dark:text-surface-400">{row[mapping.category] || "\u2014"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" size="md" icon={<ArrowLeft className="h-4 w-4" />} onClick={reset}>
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<ArrowRight className="h-4 w-4" />}
          iconPosition="right"
          state={loading ? "loading" : "idle"}
          disabled={!mapping.date || !mapping.amount || !targetAccountId}
          onClick={generatePreview}
        >
          Preview Import
        </Button>
      </div>
    </div>
  );
}
