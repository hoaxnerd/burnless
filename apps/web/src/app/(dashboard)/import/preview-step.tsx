"use client";

import { Check, Sparkles, Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import type { Step, PreviewTransaction } from "./import-utils";

interface PreviewStepProps {
  preview: PreviewTransaction[];
  activePreview: PreviewTransaction[];
  loading: boolean;
  importProgress: number;
  editingRow: number | null;
  setEditingRow: (row: number | null) => void;
  toggleRowExclusion: (index: number) => void;
  updatePreviewRow: (index: number, field: string, value: string) => void;
  executeImport: () => void;
  formatCurrency: (n: number) => string;
  setStep: React.Dispatch<React.SetStateAction<Step>>;
}

export function PreviewStep({
  preview,
  activePreview,
  loading,
  importProgress,
  editingRow,
  setEditingRow,
  toggleRowExclusion,
  updatePreviewRow,
  executeImport,
  formatCurrency,
  setStep,
}: PreviewStepProps) {
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="grid grid-cols-4 gap-4 max-w-4xl">
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
          <p className="text-sm text-surface-500 dark:text-surface-400">Ready to import</p>
          <p className="text-2xl font-bold text-success-600">{activePreview.length}</p>
        </div>
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
          <p className="text-sm text-surface-500 dark:text-surface-400">Duplicates</p>
          <p className="text-2xl font-bold text-warning-600">{preview.filter((t) => t.isDuplicate).length}</p>
        </div>
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
          <p className="text-sm text-surface-500 dark:text-surface-400">Excluded</p>
          <p className="text-2xl font-bold text-surface-500">{preview.filter((t) => t._excluded && !t.isDuplicate).length}</p>
        </div>
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
          <p className="text-sm text-surface-500 dark:text-surface-400">Total amount</p>
          <p className="text-2xl font-bold text-surface-900 dark:text-surface-50">
            {formatCurrency(activePreview.reduce((sum, t) => sum + Math.abs(t.amount), 0))}
          </p>
        </div>
      </div>

      {loading && (
        <div className="max-w-4xl">
          <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
            <span>Importing transactions...</span>
            <span>{importProgress}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${importProgress}%` }} />
          </div>
        </div>
      )}

      <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 overflow-hidden">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-50 dark:bg-surface-800 z-10">
              <tr className="border-b border-surface-200 dark:border-surface-700">
                <th scope="col" className="w-8 py-2.5 px-3"><span className="sr-only">Select</span></th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Status</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Date</th>
                <th scope="col" className="text-right py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Amount</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Description</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-brand-500" />
                    AI Category
                  </div>
                </th>
                <th scope="col" className="w-12 py-2.5 px-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 200).map((t, i) => {
                const isEditing = editingRow === i;
                return (
                  <tr
                    key={i}
                    className={`border-b border-surface-100 dark:border-surface-700/50 transition-colors ${
                      t.isDuplicate || t._excluded
                        ? "opacity-40 bg-surface-50 dark:bg-surface-900/50"
                        : t._edited
                          ? "bg-brand-50/30 dark:bg-brand-950/20"
                          : ""
                    }`}
                  >
                    <td className="py-2 px-3">
                      {!t.isDuplicate && (
                        <input
                          type="checkbox"
                          checked={!t._excluded}
                          onChange={() => toggleRowExclusion(i)}
                          className="h-3.5 w-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                        />
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {t.isDuplicate ? (
                        <span className="inline-flex items-center gap-1 text-xs text-warning-600 bg-warning-50 dark:bg-warning-950 rounded-full px-2 py-0.5">Duplicate</span>
                      ) : t._excluded ? (
                        <span className="inline-flex items-center gap-1 text-xs text-surface-500 bg-surface-100 dark:bg-surface-700 rounded-full px-2 py-0.5">Excluded</span>
                      ) : t._edited ? (
                        <span className="inline-flex items-center gap-1 text-xs text-brand-600 bg-brand-50 dark:bg-brand-950 rounded-full px-2 py-0.5">Edited</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-success-600 bg-success-50 dark:bg-success-950 rounded-full px-2 py-0.5">
                          <Check className="h-2.5 w-2.5" />
                          New
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-surface-900 dark:text-surface-50">
                      {new Date(t.date).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={t.amount}
                          onBlur={(e) => updatePreviewRow(i, "amount", e.target.value)}
                          className="w-24 rounded border border-brand-300 bg-surface-0 dark:bg-surface-900 px-2 py-0.5 text-right text-sm font-mono"
                          autoFocus
                        />
                      ) : (
                        <span className={`font-mono ${t.amount >= 0 ? "text-success-600" : "text-danger-600"}`}>
                          {formatCurrency(t.amount)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 max-w-xs">
                      {isEditing ? (
                        <input
                          type="text"
                          defaultValue={t.description || ""}
                          onBlur={(e) => updatePreviewRow(i, "description", e.target.value)}
                          className="w-full rounded border border-brand-300 bg-surface-0 dark:bg-surface-900 px-2 py-0.5 text-sm"
                        />
                      ) : (
                        <span className="text-surface-600 dark:text-surface-400 truncate block">{t.description || "\u2014"}</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {t.suggestedCategory ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              (t.categoryConfidence ?? 0) >= 0.8
                                ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300"
                                : (t.categoryConfidence ?? 0) >= 0.6
                                  ? "bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-300"
                                  : "bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400"
                            }`}
                          >
                            {t.suggestedCategory}
                          </span>
                          <span className="text-[10px] text-surface-400">
                            {Math.round((t.categoryConfidence ?? 0) * 100)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-surface-400">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {!t.isDuplicate && (
                        <button
                          onClick={() => setEditingRow(isEditing ? null : i)}
                          className={`p-1 rounded transition-colors ${
                            isEditing
                              ? "text-brand-600 bg-brand-50 dark:bg-brand-950"
                              : "text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700"
                          }`}
                        >
                          {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {preview.length > 200 && (
          <div className="border-t border-surface-200 dark:border-surface-700 px-4 py-2 text-xs text-surface-500">
            Showing first 200 of {preview.length} transactions
          </div>
        )}
      </div>

      <div className="flex items-center justify-between max-w-4xl">
        <Button variant="secondary" size="md" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep("map")}>
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Check className="h-4 w-4" />}
          state={loading ? "loading" : "idle"}
          disabled={activePreview.length === 0}
          onClick={executeImport}
        >
          Import {activePreview.length} Transactions
        </Button>
      </div>
    </div>
  );
}
