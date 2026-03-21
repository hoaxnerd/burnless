"use client";

import { Check, Upload, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import type { ImportResult } from "./import-utils";

interface ResultStepProps {
  result: ImportResult;
  reset: () => void;
  rollbackBatch: (batchId: string) => void;
}

export function ResultStep({ result, reset, rollbackBatch }: ResultStepProps) {
  return (
    <div className="max-w-2xl space-y-6 animate-slide-up">
      <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-success-50 dark:bg-success-950 flex items-center justify-center mb-4">
          <Check className="h-8 w-8 text-success-600" />
        </div>
        <h2 className="text-xl font-bold text-surface-900 dark:text-surface-50">Import Complete</h2>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          Successfully imported {result.imported} transactions
          {result.skipped > 0 && `, skipped ${result.skipped} duplicates`}
        </p>
        {result.batchId && (
          <p className="mt-1 text-xs text-surface-400">
            Batch ID: {result.batchId.slice(0, 8)}... &middot; You can undo this import from History
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 p-4 text-center">
          <p className="text-2xl font-bold text-success-700 dark:text-success-300">{result.imported}</p>
          <p className="text-xs text-success-600 dark:text-success-400">Imported</p>
        </div>
        <div className="rounded-xl bg-warning-50 dark:bg-warning-950 border border-warning-200 dark:border-warning-800 p-4 text-center">
          <p className="text-2xl font-bold text-warning-700 dark:text-warning-300">{result.skipped}</p>
          <p className="text-xs text-warning-600 dark:text-warning-400">Skipped</p>
        </div>
        <div className="rounded-xl bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 p-4 text-center">
          <p className="text-2xl font-bold text-danger-700 dark:text-danger-300">{result.errors.length}</p>
          <p className="text-xs text-danger-600 dark:text-danger-400">Errors</p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-2">Errors</h3>
          <div className="space-y-1 text-sm text-danger-600">
            {result.errors.slice(0, 10).map((err, i) => (
              <p key={i}>Row {err.index + 1}: {err.message}</p>
            ))}
            {result.errors.length > 10 && (
              <p className="text-surface-500">...and {result.errors.length - 10} more</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" size="md" icon={<Upload className="h-4 w-4" />} onClick={reset}>
          Import More
        </Button>
        <a
          href="/expenses"
          className="inline-flex items-center gap-2 rounded-xl border border-surface-300 dark:border-surface-600 px-4 py-2.5 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
        >
          View Transactions
          <ArrowRight className="h-4 w-4" />
        </a>
        {result.batchId && (
          <button
            onClick={() => {
              rollbackBatch(result.batchId!);
              reset();
            }}
            className="inline-flex items-center gap-2 text-sm text-danger-600 hover:text-danger-700 font-medium ml-auto"
          >
            <RotateCcw className="h-4 w-4" />
            Undo Import
          </button>
        )}
      </div>
    </div>
  );
}
