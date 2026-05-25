"use client";

import { X, FileSpreadsheet, RotateCcw } from "lucide-react";
import type { ImportBatch } from "./import-utils";
import { useLocale } from "@/components/locale/locale-context";

interface ImportHistoryPanelProps {
  history: ImportBatch[];
  historyLoading: boolean;
  setShowHistory: (show: boolean) => void;
  rollbackBatch: (batchId: string) => void;
}

export function ImportHistoryPanel({
  history,
  historyLoading,
  setShowHistory,
  rollbackBatch,
}: ImportHistoryPanelProps) {
  const { fmtDate } = useLocale();
  return (
    <div className="mb-6 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700">
        <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
          Import History
        </h3>
        <button onClick={() => setShowHistory(false)} className="text-surface-400 hover:text-surface-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      {historyLoading ? (
        <div className="p-6 text-center text-sm text-surface-500">Loading...</div>
      ) : history.length === 0 ? (
        <div className="p-6 text-center text-sm text-surface-500">No imports yet</div>
      ) : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-50 dark:bg-surface-800">
              <tr className="border-b border-surface-200 dark:border-surface-700">
                <th scope="col" className="text-left py-2 px-4 font-medium text-surface-600 dark:text-surface-400">File</th>
                <th scope="col" className="text-left py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Account</th>
                <th scope="col" className="text-center py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Imported</th>
                <th scope="col" className="text-center py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Status</th>
                <th scope="col" className="text-left py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Date</th>
                <th scope="col" className="text-right py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((batch) => (
                <tr key={batch.id} className="border-b border-surface-100 dark:border-surface-700/50">
                  <td className="py-2 px-4 text-surface-900 dark:text-surface-50 font-medium">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-surface-400" />
                      {batch.fileName}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-surface-600 dark:text-surface-400">
                    {batch.accountName || "\u2014"}
                  </td>
                  <td className="py-2 px-4 text-center text-surface-900 dark:text-surface-50">
                    {batch.importedCount}
                  </td>
                  <td className="py-2 px-4 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        batch.status === "completed"
                          ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300"
                          : batch.status === "rolled_back"
                            ? "bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400"
                            : batch.status === "failed"
                              ? "bg-danger-50 text-danger-700 dark:bg-danger-950 dark:text-danger-300"
                              : "bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-300"
                      }`}
                    >
                      {batch.status === "rolled_back" ? "Undone" : batch.status}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-surface-600 dark:text-surface-400 text-xs">
                    {fmtDate(batch.createdAt)}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {batch.status === "completed" && (
                      <button
                        onClick={() => rollbackBatch(batch.id)}
                        className="inline-flex items-center gap-1 text-xs text-danger-600 hover:text-danger-700 font-medium"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Undo
                      </button>
                    )}
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
