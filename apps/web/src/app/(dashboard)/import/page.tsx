"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";
import Papa from "papaparse";

type Step = "upload" | "map" | "preview" | "result";

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  date: string;
  amount: string;
  description: string;
}

interface AccountOption {
  id: string;
  name: string;
  type: string;
  category: string;
}

interface PreviewTransaction {
  date: string;
  amount: number;
  description: string | null;
  accountId: string;
  externalId: string;
  isDuplicate?: boolean;
  suggestedCategory?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; message: string }>;
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: "",
    amount: "",
    description: "",
  });
  const [targetAccountId, setTargetAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [preview, setPreview] = useState<PreviewTransaction[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load accounts on mount
  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0 && !targetAccountId) {
          setTargetAccountId(data[0].id);
        }
      }
    } catch {
      // Accounts will be empty — user can still proceed
    }
  }, [targetAccountId]);

  // Parse uploaded CSV file
  const handleFile = useCallback(
    (file: File) => {
      if (
        !file.name.endsWith(".csv") &&
        !file.name.endsWith(".tsv") &&
        !file.name.endsWith(".txt")
      ) {
        setError("Please upload a CSV, TSV, or TXT file");
        return;
      }

      setError(null);
      setFileName(file.name);

      Papa.parse<ParsedRow>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        complete: (results) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            setError(`Parse error: ${results.errors[0].message}`);
            return;
          }

          const parsedHeaders = results.meta.fields || [];
          setHeaders(parsedHeaders);
          setRows(results.data);

          // Auto-detect column mapping
          const autoMap: ColumnMapping = { date: "", amount: "", description: "" };
          for (const h of parsedHeaders) {
            const lower = h.toLowerCase();
            if (!autoMap.date && /date|posted|time|when/i.test(lower)) {
              autoMap.date = h;
            }
            if (
              !autoMap.amount &&
              /amount|total|sum|debit|credit|value|price/i.test(lower)
            ) {
              autoMap.amount = h;
            }
            if (
              !autoMap.description &&
              /desc|memo|narrat|detail|note|payee|merchant|name|reference/i.test(
                lower
              )
            ) {
              autoMap.description = h;
            }
          }
          setMapping(autoMap);
          loadAccounts();
          setStep("map");
        },
      });
    },
    [loadAccounts]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  // Generate preview with dry run
  const generatePreview = async () => {
    if (!mapping.date || !mapping.amount || !targetAccountId) {
      setError("Please map the Date and Amount columns and select a target account");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const mapped = rows
        .map((row, idx) => {
          const dateStr = row[mapping.date]?.trim();
          const amountStr = row[mapping.amount]?.trim();
          const desc = mapping.description
            ? row[mapping.description]?.trim() || null
            : null;

          if (!dateStr || !amountStr) return null;

          // Parse amount — handle formats like ($1,234.56), -1234.56, 1,234.56
          let amount = parseFloat(
            amountStr.replace(/[$,()]/g, "").replace(/^\((.+)\)$/, "-$1")
          );
          if (isNaN(amount)) return null;

          // Parse date
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return null;

          return {
            date: date.toISOString(),
            amount,
            description: desc,
            accountId: targetAccountId,
          };
        })
        .filter(Boolean);

      // Dry run
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: mapped, dryRun: true }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to preview import");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setPreview(data.transactions || []);
      setStep("preview");
    } catch (e) {
      setError("Failed to generate preview");
    } finally {
      setLoading(false);
    }
  };

  // Execute import
  const executeImport = async () => {
    setLoading(true);
    setError(null);

    try {
      const mapped = rows
        .map((row) => {
          const dateStr = row[mapping.date]?.trim();
          const amountStr = row[mapping.amount]?.trim();
          const desc = mapping.description
            ? row[mapping.description]?.trim() || null
            : null;

          if (!dateStr || !amountStr) return null;

          let amount = parseFloat(
            amountStr.replace(/[$,()]/g, "").replace(/^\((.+)\)$/, "-$1")
          );
          if (isNaN(amount)) return null;

          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return null;

          return {
            date: date.toISOString(),
            amount,
            description: desc,
            accountId: targetAccountId,
          };
        })
        .filter(Boolean);

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: mapped, dryRun: false }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Import failed");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch {
      setError("Import failed");
    } finally {
      setLoading(false);
    }
  };

  // Reset everything
  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({ date: "", amount: "", description: "" });
    setPreview([]);
    setResult(null);
    setError(null);
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
          Import Transactions
        </h1>
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          Upload bank statements or spreadsheets to import transactions
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(["upload", "map", "preview", "result"] as Step[]).map((s, i) => {
          const labels = ["Upload", "Map Columns", "Preview", "Done"];
          const isActive = s === step;
          const isDone =
            (["upload", "map", "preview", "result"] as Step[]).indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`w-8 h-px ${isDone ? "bg-brand-500" : "bg-surface-200 dark:bg-surface-700"}`}
                />
              )}
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : isDone
                      ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300"
                      : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
                }`}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{i + 1}</span>
                )}
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-950 dark:text-danger-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="max-w-2xl">
          <div
            className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
              dragActive
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                : "border-surface-300 dark:border-surface-600 hover:border-brand-400"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload className="mx-auto h-12 w-12 text-surface-400 mb-4" />
            <p className="text-lg font-medium text-surface-900 dark:text-surface-50">
              Drop your file here
            </p>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              or click to browse. Supports CSV, TSV files.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Select File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          <div className="mt-6 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-3">
              Supported formats
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm text-surface-600 dark:text-surface-400">
              {[
                "Chase bank statements",
                "Mercury exports",
                "SVB / First Republic",
                "Brex card exports",
                "Stripe payouts",
                "Any CSV with date & amount",
              ].map((fmt) => (
                <div key={fmt} className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-surface-400" />
                  {fmt}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === "map" && (
        <div className="max-w-3xl space-y-6">
          <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                File: {fileName}
              </h3>
              <span className="text-xs text-surface-500">
                {rows.length} rows found
              </span>
            </div>

            <div className="space-y-4">
              {/* Date mapping */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  Date column <span className="text-danger-500">*</span>
                </label>
                <select
                  value={mapping.date}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select column...</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount mapping */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  Amount column <span className="text-danger-500">*</span>
                </label>
                <select
                  value={mapping.amount}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, amount: e.target.value }))
                  }
                  className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select column...</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description mapping */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  Description column{" "}
                  <span className="text-surface-400">(optional)</span>
                </label>
                <select
                  value={mapping.description}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, description: e.target.value }))
                  }
                  className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">None</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

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
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.category})
                    </option>
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
                      <th className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">
                        Date
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-surface-600 dark:text-surface-400">
                        Amount
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-surface-100 dark:border-surface-700/50"
                      >
                        <td className="py-2 px-3 text-surface-900 dark:text-surface-50">
                          {row[mapping.date] || "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-surface-900 dark:text-surface-50">
                          {row[mapping.amount] || "—"}
                        </td>
                        <td className="py-2 px-3 text-surface-600 dark:text-surface-400 max-w-xs truncate">
                          {mapping.description
                            ? row[mapping.description] || "—"
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={reset}
              className="flex items-center gap-2 rounded-lg border border-surface-300 dark:border-surface-600 px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={generatePreview}
              disabled={!mapping.date || !mapping.amount || !targetAccountId || loading}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Preview Import
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4 max-w-3xl">
            <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Ready to import
              </p>
              <p className="text-2xl font-bold text-surface-900 dark:text-surface-50">
                {preview.filter((t) => !t.isDuplicate).length}
              </p>
            </div>
            <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Duplicates (skipped)
              </p>
              <p className="text-2xl font-bold text-warning-600">
                {preview.filter((t) => t.isDuplicate).length}
              </p>
            </div>
            <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Total amount
              </p>
              <p className="text-2xl font-bold text-surface-900 dark:text-surface-50">
                {formatCurrency(
                  preview
                    .filter((t) => !t.isDuplicate)
                    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
                )}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 overflow-hidden">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-50 dark:bg-surface-800">
                  <tr className="border-b border-surface-200 dark:border-surface-700">
                    <th className="text-left py-2.5 px-4 font-medium text-surface-600 dark:text-surface-400">
                      Status
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-surface-600 dark:text-surface-400">
                      Date
                    </th>
                    <th className="text-right py-2.5 px-4 font-medium text-surface-600 dark:text-surface-400">
                      Amount
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-surface-600 dark:text-surface-400">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 100).map((t, i) => (
                    <tr
                      key={i}
                      className={`border-b border-surface-100 dark:border-surface-700/50 ${
                        t.isDuplicate ? "opacity-50" : ""
                      }`}
                    >
                      <td className="py-2 px-4">
                        {t.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 text-xs text-warning-600 bg-warning-50 dark:bg-warning-950 rounded-full px-2 py-0.5">
                            Duplicate
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-success-600 bg-success-50 dark:bg-success-950 rounded-full px-2 py-0.5">
                            New
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-surface-900 dark:text-surface-50">
                        {new Date(t.date).toLocaleDateString()}
                      </td>
                      <td
                        className={`py-2 px-4 text-right font-mono ${
                          t.amount >= 0
                            ? "text-success-600"
                            : "text-danger-600"
                        }`}
                      >
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="py-2 px-4 text-surface-600 dark:text-surface-400 max-w-xs truncate">
                        {t.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 100 && (
              <div className="border-t border-surface-200 dark:border-surface-700 px-4 py-2 text-xs text-surface-500">
                Showing first 100 of {preview.length} transactions
              </div>
            )}
          </div>

          <div className="flex items-center justify-between max-w-3xl">
            <button
              onClick={() => setStep("map")}
              className="flex items-center gap-2 rounded-lg border border-surface-300 dark:border-surface-600 px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={executeImport}
              disabled={loading || preview.filter((t) => !t.isDuplicate).length === 0}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Import {preview.filter((t) => !t.isDuplicate).length} Transactions
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === "result" && result && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-8 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-success-50 dark:bg-success-950 flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-success-600" />
            </div>
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-50">
              Import Complete
            </h2>
            <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
              Successfully imported {result.imported} transactions
              {result.skipped > 0 && `, skipped ${result.skipped} duplicates`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 p-4 text-center">
              <p className="text-2xl font-bold text-success-700 dark:text-success-300">
                {result.imported}
              </p>
              <p className="text-xs text-success-600 dark:text-success-400">
                Imported
              </p>
            </div>
            <div className="rounded-xl bg-warning-50 dark:bg-warning-950 border border-warning-200 dark:border-warning-800 p-4 text-center">
              <p className="text-2xl font-bold text-warning-700 dark:text-warning-300">
                {result.skipped}
              </p>
              <p className="text-xs text-warning-600 dark:text-warning-400">
                Skipped
              </p>
            </div>
            <div className="rounded-xl bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 p-4 text-center">
              <p className="text-2xl font-bold text-danger-700 dark:text-danger-300">
                {result.errors.length}
              </p>
              <p className="text-xs text-danger-600 dark:text-danger-400">
                Errors
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-2">
                Errors
              </h3>
              <div className="space-y-1 text-sm text-danger-600">
                {result.errors.slice(0, 10).map((err, i) => (
                  <p key={i}>
                    Row {err.index + 1}: {err.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import More
            </button>
            <a
              href="/expenses"
              className="flex items-center gap-2 rounded-lg border border-surface-300 dark:border-surface-600 px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
              View Transactions
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
