"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileSpreadsheet, Check, AlertCircle, X, Sparkles, History, Link2 } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui";
import { autoMapColumns } from "./import-utils";
import type {
  Step, ParsedRow, ColumnMapping, MappingConfidence,
  AccountOption, PreviewTransaction, ImportResult, ImportBatch,
} from "./import-utils";
import { UploadStep } from "./upload-step";
import { MapStep } from "./map-step";
import { PreviewStep } from "./preview-step";
import { ResultStep } from "./result-step";
import { ImportHistoryPanel } from "./import-history-panel";
import { BankSyncPanel } from "./bank-sync-panel";

interface ImportFlowProps {
  embedded?: boolean;
}

export function ImportFlow({ embedded = false }: ImportFlowProps) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: "", amount: "", description: "", category: "" });
  const [mappingConfidence, setMappingConfidence] = useState<MappingConfidence>({ date: 0, amount: 0, description: 0, category: 0 });
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
        if (data.length > 0 && !targetAccountId) setTargetAccountId(data[0].id);
      }
    } catch { /* silent */ }
  }, [targetAccountId]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/imports");
      if (res.ok) {
        const json = await res.json();
        setHistory(json.data ?? json);
      }
    } catch { /* silent */ }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv") && !file.name.endsWith(".tsv") && !file.name.endsWith(".txt")) {
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

  const handleDragLeave = useCallback(() => { setDragActive(false); }, []);

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
          const amount = parseFloat(amountStr.replace(/[$,\u20AC\u00A3()]/g, "").replace(/^\((.+)\)$/, "-$1"));
          if (isNaN(amount)) return null;
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return null;
          return { date: date.toISOString(), amount, description: desc, accountId: targetAccountId };
        })
        .filter(Boolean);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: mapped, dryRun: true, fileName, columnMapping: mapping }),
      });
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to preview import");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPreview(
        (data.transactions || []).map((t: PreviewTransaction) => ({ ...t, _edited: false, _excluded: false }))
      );
      setStep("preview");
    } catch { setError("Failed to generate preview"); }
    finally { setLoading(false); }
  };

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
        date: t.date, amount: t.amount, description: t.description, accountId: t.accountId,
      }));
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: mapped, dryRun: false, fileName, columnMapping: mapping }),
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
    } catch { setError("Import failed"); }
    finally { setLoading(false); }
  };

  const rollbackBatch = async (batchId: string) => {
    try {
      const res = await fetch(`/api/imports/${batchId}`, { method: "DELETE" });
      if (res.ok) { loadHistory(); }
      else {
        const data = await res.json();
        setError(data.error || "Rollback failed");
      }
    } catch { setError("Rollback failed"); }
  };

  const toggleRowExclusion = (index: number) => {
    setPreview((prev) => prev.map((t, i) => (i === index ? { ...t, _excluded: !t._excluded } : t)));
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
      {/* Header — hidden when embedded in Data Room */}
      {!embedded && (
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-surface-50">Import Transactions</h1>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              Upload bank statements, connect accounts, or import spreadsheets
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="sm" icon={<History className="h-4 w-4" />}
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}>
              History
            </Button>
            <Button variant="secondary" size="sm" icon={<Link2 className="h-4 w-4" />}
              onClick={() => setShowBankSync(!showBankSync)}>
              Bank Sync
            </Button>
          </div>
        </div>
      )}

      {/* History / Bank Sync toggle buttons when embedded */}
      {embedded && (
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" icon={<History className="h-4 w-4" />}
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}>
            History
          </Button>
          <Button variant="secondary" size="sm" icon={<Link2 className="h-4 w-4" />}
            onClick={() => setShowBankSync(!showBankSync)}>
            Bank Sync
          </Button>
        </div>
      )}

      {showHistory && (
        <ImportHistoryPanel history={history} historyLoading={historyLoading}
          setShowHistory={setShowHistory} rollbackBatch={rollbackBatch} />
      )}
      {showBankSync && <BankSyncPanel setShowBankSync={setShowBankSync} />}

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 sm:mb-8 overflow-x-auto">
        {(["upload", "map", "preview", "result"] as Step[]).map((s, i) => {
          const labels = ["Upload", "Map Columns", "Preview & Edit", "Done"];
          const icons = [Upload, FileSpreadsheet, Sparkles, Check];
          const Icon = icons[i]!;
          const isActive = s === step;
          const isDone = (["upload", "map", "preview", "result"] as Step[]).indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-8 h-px transition-colors ${isDone ? "bg-brand-500" : "bg-surface-200 dark:bg-surface-700"}`} />
              )}
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800"
                  : isDone
                    ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300"
                    : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
              }`}>
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
          <button onClick={() => setError(null)} aria-label="Dismiss error" className="ml-auto min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === "upload" && (
        <UploadStep dragActive={dragActive} handleDrop={handleDrop} handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave} fileInputRef={fileInputRef} handleFile={handleFile} />
      )}
      {step === "map" && (
        <MapStep fileName={fileName} rows={rows} headers={headers} mapping={mapping}
          setMapping={setMapping} mappingConfidence={mappingConfidence}
          setMappingConfidence={setMappingConfidence} targetAccountId={targetAccountId}
          setTargetAccountId={setTargetAccountId} accounts={accounts} loading={loading}
          reset={reset} generatePreview={generatePreview} />
      )}
      {step === "preview" && (
        <PreviewStep preview={preview} activePreview={activePreview} loading={loading}
          importProgress={importProgress} editingRow={editingRow} setEditingRow={setEditingRow}
          toggleRowExclusion={toggleRowExclusion} updatePreviewRow={updatePreviewRow}
          executeImport={executeImport} formatCurrency={formatCurrency} setStep={setStep} />
      )}
      {step === "result" && result && (
        <ResultStep result={result} reset={reset} rollbackBatch={rollbackBatch} />
      )}
    </div>
  );
}
