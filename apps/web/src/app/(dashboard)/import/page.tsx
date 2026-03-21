"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  X,
  Loader2,
  Sparkles,
  Pencil,
  History,
  RotateCcw,
  Link2,
  Building2,
  CreditCard,
  Zap,
} from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui";

type Step = "upload" | "map" | "preview" | "result";

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  date: string;
  amount: string;
  description: string;
  category: string;
}

interface MappingConfidence {
  date: number;
  amount: number;
  description: number;
  category: number;
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
  categoryConfidence?: number;
  metadata?: Record<string, unknown>;
  _edited?: boolean;
  _excluded?: boolean;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; message: string }>;
  batchId?: string;
}

interface ImportBatch {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  accountName: string | null;
  rolledBackAt: string | null;
  createdAt: string;
}

// ── Column Mapping Patterns ──────────────────────────────────────────────────

const COLUMN_PATTERNS: Record<keyof ColumnMapping, { patterns: RegExp[] }> = {
  date: {
    patterns: [
      /^date$/i,
      /^transaction.?date$/i,
      /^posted.?date$/i,
      /^posting.?date$/i,
      /date|posted|time|when|timestamp/i,
    ],
  },
  amount: {
    patterns: [
      /^amount$/i,
      /^transaction.?amount$/i,
      /^debit$/i,
      /^credit$/i,
      /amount|total|sum|debit|credit|value|price|cost/i,
    ],
  },
  description: {
    patterns: [
      /^description$/i,
      /^memo$/i,
      /^payee$/i,
      /^merchant$/i,
      /desc|memo|narrat|detail|note|payee|merchant|name|reference|vendor/i,
    ],
  },
  category: {
    patterns: [
      /^category$/i,
      /^type$/i,
      /^classification$/i,
      /categ|classif|type|label|group|department/i,
    ],
  },
};

function autoMapColumns(headers: string[]): { mapping: ColumnMapping; confidence: MappingConfidence } {
  const mapping: ColumnMapping = { date: "", amount: "", description: "", category: "" };
  const confidence: MappingConfidence = { date: 0, amount: 0, description: 0, category: 0 };
  const used = new Set<string>();

  for (const field of ["date", "amount", "description", "category"] as const) {
    const { patterns } = COLUMN_PATTERNS[field];
    let bestScore = 0;
    let bestHeader = "";

    for (const h of headers) {
      if (used.has(h)) continue;
      for (let pi = 0; pi < patterns.length; pi++) {
        if (patterns[pi]!.test(h)) {
          const score = 1 - pi * 0.15;
          if (score > bestScore) {
            bestScore = score;
            bestHeader = h;
          }
          break;
        }
      }
    }

    if (bestHeader) {
      mapping[field] = bestHeader;
      confidence[field] = Math.min(bestScore, 1);
      used.add(bestHeader);
    }
  }

  return { mapping, confidence };
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "text-success-600 bg-success-50 dark:bg-success-950 dark:text-success-400";
  if (c >= 0.5) return "text-warning-600 bg-warning-50 dark:bg-warning-950 dark:text-warning-400";
  return "text-surface-500 bg-surface-100 dark:bg-surface-800 dark:text-surface-400";
}

function confidenceLabel(c: number): string {
  if (c >= 0.8) return "High confidence";
  if (c >= 0.5) return "Needs review";
  return "Not detected";
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: "",
    amount: "",
    description: "",
    category: "",
  });
  const [mappingConfidence, setMappingConfidence] = useState<MappingConfidence>({
    date: 0,
    amount: 0,
    description: 0,
    category: 0,
  });
  const [targetAccountId, setTargetAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [preview, setPreview] = useState<PreviewTransaction[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [showBankSync, setShowBankSync] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // silent
    }
  }, [targetAccountId]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/imports");
      if (res.ok) {
        const json = await res.json();
        setHistory(json.data ?? json);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Parse CSV file
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
            setError(`Parse error: ${results.errors[0]?.message ?? "Unknown error"}`);
            return;
          }

          const parsedHeaders = results.meta.fields || [];
          setHeaders(parsedHeaders);
          setRows(results.data);

          const { mapping: autoMap, confidence } = autoMapColumns(parsedHeaders);
          setMapping(autoMap);
          setMappingConfidence(confidence);

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

  // Generate preview with AI categorization
  const generatePreview = async () => {
    if (!mapping.date || !mapping.amount || !targetAccountId) {
      setError("Please map the Date and Amount columns and select a target account");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const mapped = rows
        .map((row) => {
          const dateStr = row[mapping.date]?.trim();
          const amountStr = row[mapping.amount]?.trim();
          const desc = mapping.description ? row[mapping.description]?.trim() || null : null;

          if (!dateStr || !amountStr) return null;

          const amount = parseFloat(
            amountStr.replace(/[$,\u20AC\u00A3()]/g, "").replace(/^\((.+)\)$/, "-$1")
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
        body: JSON.stringify({
          transactions: mapped,
          dryRun: true,
          fileName,
          columnMapping: mapping,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to preview import");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setPreview(
        (data.transactions || []).map((t: PreviewTransaction) => ({
          ...t,
          _edited: false,
          _excluded: false,
        }))
      );
      setStep("preview");
    } catch {
      setError("Failed to generate preview");
    } finally {
      setLoading(false);
    }
  };

  // Execute import with progress
  const executeImport = async () => {
    setLoading(true);
    setError(null);
    setImportProgress(0);

    try {
      const toImport = preview.filter((t) => !t.isDuplicate && !t._excluded);

      const progressInterval = setInterval(() => {
        setImportProgress((p) => Math.min(p + 5, 90));
      }, 100);

      const mapped = toImport.map((t) => ({
        date: t.date,
        amount: t.amount,
        description: t.description,
        accountId: t.accountId,
      }));

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: mapped,
          dryRun: false,
          fileName,
          columnMapping: mapping,
        }),
      });

      clearInterval(progressInterval);
      setImportProgress(100);

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

  const rollbackBatch = async (batchId: string) => {
    try {
      const res = await fetch(`/api/imports/${batchId}`, { method: "DELETE" });
      if (res.ok) {
        loadHistory();
      } else {
        const data = await res.json();
        setError(data.error || "Rollback failed");
      }
    } catch {
      setError("Rollback failed");
    }
  };

  const toggleRowExclusion = (index: number) => {
    setPreview((prev) =>
      prev.map((t, i) => (i === index ? { ...t, _excluded: !t._excluded } : t))
    );
  };

  const updatePreviewRow = (index: number, field: string, value: string) => {
    setPreview((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        if (field === "amount") {
          const num = parseFloat(value);
          if (!isNaN(num)) return { ...t, amount: num, _edited: true };
          return t;
        }
        return { ...t, [field]: value, _edited: true };
      })
    );
  };

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({ date: "", amount: "", description: "", category: "" });
    setMappingConfidence({ date: 0, amount: 0, description: 0, category: 0 });
    setPreview([]);
    setResult(null);
    setError(null);
    setImportProgress(0);
    setEditingRow(null);
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const activePreview = preview.filter((t) => !t.isDuplicate && !t._excluded);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
            Import Transactions
          </h1>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            Upload bank statements, connect accounts, or import spreadsheets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<History className="h-4 w-4" />}
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) loadHistory();
            }}
          >
            History
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Link2 className="h-4 w-4" />}
            onClick={() => setShowBankSync(!showBankSync)}
          >
            Bank Sync
          </Button>
        </div>
      </div>

      {/* Import History Panel */}
      {showHistory && (
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
                    <th className="text-left py-2 px-4 font-medium text-surface-600 dark:text-surface-400">File</th>
                    <th className="text-left py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Account</th>
                    <th className="text-center py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Imported</th>
                    <th className="text-center py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Status</th>
                    <th className="text-left py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Date</th>
                    <th className="text-right py-2 px-4 font-medium text-surface-600 dark:text-surface-400">Actions</th>
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
                        {new Date(batch.createdAt).toLocaleDateString()}
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
      )}

      {/* Bank Sync Panel */}
      {showBankSync && (
        <div className="mb-6 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
              Bank & Payment Connections
            </h3>
            <button onClick={() => setShowBankSync(false)} className="text-surface-400 hover:text-surface-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { name: "Plaid", desc: "Connect 12,000+ banks", icon: Building2, color: "text-brand-600" },
                { name: "Mercury", desc: "Auto-sync transactions", icon: CreditCard, color: "text-violet-600" },
                { name: "Stripe", desc: "Revenue & payouts", icon: Zap, color: "text-amber-600" },
              ].map((provider) => (
                <button
                  key={provider.name}
                  className="flex items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-700 p-4 text-left hover:border-brand-300 hover:bg-brand-50/50 dark:hover:border-brand-800 dark:hover:bg-brand-950/30 transition-all group"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-surface-50 dark:bg-surface-700 ${provider.color}`}>
                    <provider.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">{provider.name}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">{provider.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-surface-300 group-hover:text-brand-500 transition-colors" />
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-surface-500 dark:text-surface-400 text-center">
              Bank sync requires API keys. Configure in Settings &rarr; Integrations.
            </p>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(["upload", "map", "preview", "result"] as Step[]).map((s, i) => {
          const labels = ["Upload", "Map Columns", "Preview & Edit", "Done"];
          const icons = [Upload, FileSpreadsheet, Sparkles, Check];
          const Icon = icons[i]!;
          const isActive = s === step;
          const isDone =
            (["upload", "map", "preview", "result"] as Step[]).indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-8 h-px transition-colors ${isDone ? "bg-brand-500" : "bg-surface-200 dark:bg-surface-700"}`} />
              )}
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800"
                    : isDone
                      ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300"
                      : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
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

      {/* ── Step 1: Upload ────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="max-w-2xl animate-slide-up">
          <div
            className={`rounded-xl border-2 border-dashed p-12 text-center transition-all ${
              dragActive
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950 scale-[1.01]"
                : "border-surface-300 dark:border-surface-600 hover:border-brand-400"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center mb-4">
              <Upload className="h-7 w-7 text-brand-600" />
            </div>
            <p className="text-lg font-semibold text-surface-900 dark:text-surface-50">
              Drop your file here
            </p>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              CSV, TSV, or TXT from any bank or spreadsheet
            </p>
            <Button variant="primary" size="md" className="mt-4" icon={<Upload className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
              Select File
            </Button>
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
                "QuickBooks exports",
                "Xero CSV export",
                "Any CSV with date & amount",
              ].map((fmt) => (
                <div key={fmt} className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-surface-400 flex-shrink-0" />
                  {fmt}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Map Columns with AI Confidence ────────────────────────── */}
      {step === "map" && (
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
                      <th className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Date</th>
                      <th className="text-right py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Amount</th>
                      <th className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Description</th>
                      {mapping.category && (
                        <th className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Category</th>
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
      )}

      {/* ── Step 3: Preview with AI Categorization & Bulk Edit ────────────── */}
      {step === "preview" && (
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
                    <th className="w-8 py-2.5 px-3"></th>
                    <th className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Status</th>
                    <th className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Date</th>
                    <th className="text-right py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Amount</th>
                    <th className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">Description</th>
                    <th className="text-left py-2.5 px-3 font-medium text-surface-600 dark:text-surface-400">
                      <div className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-brand-500" />
                        AI Category
                      </div>
                    </th>
                    <th className="w-12 py-2.5 px-3"></th>
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
      )}

      {/* ── Step 4: Result ────────────────────────────────────────────────── */}
      {step === "result" && result && (
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
      )}
    </div>
  );
}
