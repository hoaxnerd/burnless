"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Upload, FileSpreadsheet, Check, AlertCircle, X, Sparkles, History, Link2 } from "lucide-react";
import { useLocale } from "@/components/locale/locale-context";
import Papa from "papaparse";
import { Button, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { extractApiError, toUserMessage } from "@/lib/api-error";
import { useImports, useAccounts, revalidate, KEYS } from "@/lib/swr";
import { formatCurrency, type CurrencyCode } from "@burnless/types";
import { autoMapColumns, resolveAmount } from "./import-utils";
import type {
  Step, ParsedRow, ColumnMapping, AnyColumnMapping, MappingConfidence,
  AccountOption, PreviewTransaction, ImportResult, ImportBatch,
  FundingRoundColumnMapping, ImportTarget,
} from "./import-utils";
import { UploadStep } from "./upload-step";
import { MapStep } from "./map-step";
import { PreviewStep } from "./preview-step";
import { ResultStep } from "./result-step";
import { ImportHistoryPanel } from "./import-history-panel";
import { BankSyncPanel } from "./bank-sync-panel";

interface ImportFlowProps {
  embedded?: boolean;
  currency?: CurrencyCode;
}

export function ImportFlow({ embedded = false, currency = "USD" }: ImportFlowProps) {
  const [target, setTarget] = useState<ImportTarget>("transactions");
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: "", amount: "", description: "", category: "" });
  const [mappingConfidence, setMappingConfidence] = useState<MappingConfidence>({ date: 0, amount: 0, description: 0, category: 0, vendor: 0, notes: 0, externalId: 0 });
  const [fundingPreview, setFundingPreview] = useState<Array<Record<string, unknown>>>([]);
  const [targetAccountId, setTargetAccountId] = useState("");
  const [preview, setPreview] = useState<PreviewTransaction[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [showBankSync, setShowBankSync] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // Accounts dropdown (target-account picker) — shared SWR cache, so an account
  // created elsewhere shows up here without a reload.
  const { data: accountsData, error: accountsError } = useAccounts();
  const accounts = (accountsData ?? []) as unknown as AccountOption[];

  // Default the target account to the first one once accounts load.
  useEffect(() => {
    if (accounts.length > 0 && !targetAccountId) setTargetAccountId(accounts[0]!.id);
  }, [accounts, targetAccountId]);

  useEffect(() => {
    if (accountsError) toast.error(toUserMessage(accountsError));
  }, [accountsError, toast]);

  // DATA-02: import history from the shared SWR cache. Revalidated after every
  // completed import / rollback so the History panel never shows a stale list.
  const {
    data: importsData,
    error: historyError,
    isLoading: historyLoading,
    mutate: mutateImports,
  } = useImports();
  const history = (importsData?.data ?? []) as unknown as ImportBatch[];

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
            setError(
              "We couldn't read that file. Please check it's a valid CSV/TSV and try again.",
            );
            return;
          }
          const parsedHeaders = results.meta.fields || [];
          setHeaders(parsedHeaders);
          setRows(results.data);
          const { mapping: autoMap, confidence } = autoMapColumns(parsedHeaders, { target });
          setMapping(autoMap as ColumnMapping);
          setMappingConfidence(confidence);
          // Refresh the accounts dropdown before showing the Map step.
          void revalidate(KEYS.accounts);
          setStep("map");
        },
      });
    },
    [target]
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

  const generateFundingPreview = async () => {
    const fm = mapping as unknown as FundingRoundColumnMapping;
    if (!fm.name || !fm.roundType || !fm.amount || !fm.date) {
      setError("Please map the Name, Round Type, Amount, and Date columns");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "funding-rounds",
          rounds: rows,
          mapping: fm,
          dryRun: true,
        }),
      });
      if (!res.ok) {
        setError(await extractApiError(res));
        setLoading(false);
        return;
      }
      const data = await res.json();
      setFundingPreview(data.preview ?? []);
      setStep("preview");
    } catch { setError("Failed to generate preview"); }
    finally { setLoading(false); }
  };

  const executeFundingImport = async () => {
    const fm = mapping as unknown as FundingRoundColumnMapping;
    setLoading(true);
    setError(null);
    setImportProgress(0);
    try {
      const progressInterval = setInterval(() => {
        setImportProgress((p) => Math.min(p + 5, 90));
      }, 100);
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "funding-rounds",
          rounds: rows,
          mapping: fm,
          dryRun: false,
        }),
      });
      clearInterval(progressInterval);
      setImportProgress(100);
      if (!res.ok) {
        setError(await extractApiError(res));
        setLoading(false);
        return;
      }
      const data = await res.json();
      setResult({ imported: data.imported, skipped: data.skipped, errors: data.errors ?? [] });
      // DATA-02: refresh import history so the new batch appears immediately.
      await mutateImports();
      setStep("result");
    } catch { setError("Import failed"); }
    finally { setLoading(false); }
  };

  const generatePreview = async () => {
    if (target === "funding-rounds") { await generateFundingPreview(); return; }
    // Validate that amount is fully mapped \u2014 single-column needs a header,
    // polymorphic needs both debit and credit headers.
    const amountReady =
      typeof mapping.amount === "string"
        ? mapping.amount !== ""
        : mapping.amount.debit !== "" && mapping.amount.credit !== "";
    if (!mapping.date || !amountReady || !targetAccountId) {
      setError("Please map the Date and Amount columns and select a target account");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const mapped = rows
        .map((row) => {
          const dateStr = row[mapping.date]?.trim();
          if (!dateStr) return null;
          const amount = resolveAmount(row, mapping.amount);
          // Skip rows where neither debit nor credit (or amount) had any value.
          if (amount === 0) {
            const hasAnyAmountCell =
              typeof mapping.amount === "string"
                ? !!row[mapping.amount]?.trim()
                : !!row[mapping.amount.debit]?.trim() || !!row[mapping.amount.credit]?.trim();
            if (!hasAnyAmountCell) return null;
          }
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return null;
          const desc = mapping.description ? row[mapping.description]?.trim() || null : null;
          const vendor = mapping.vendor ? row[mapping.vendor]?.trim() || null : null;
          const notes = mapping.notes ? row[mapping.notes]?.trim() || null : null;
          const externalId =
            mapping.externalId && row[mapping.externalId]?.trim()
              ? row[mapping.externalId]!.trim()
              : undefined;
          return {
            date: date.toISOString(),
            amount,
            description: desc,
            accountId: targetAccountId,
            vendor,
            notes,
            externalId,
          };
        })
        .filter(Boolean);
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: mapped, dryRun: true, fileName, columnMapping: mapping }),
      });
      if (!res.ok) {
        setError(await extractApiError(res));
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
    if (target === "funding-rounds") { await executeFundingImport(); return; }
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
        vendor: t.vendor ?? null,
        notes: t.notes ?? null,
        externalId: t.externalId || undefined,
      }));
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: mapped, dryRun: false, fileName, columnMapping: mapping }),
      });
      clearInterval(progressInterval);
      setImportProgress(100);
      if (!res.ok) {
        setError(await extractApiError(res));
        setLoading(false);
        return;
      }
      const data = await res.json();
      setResult(data);
      // DATA-02: refresh import history so the new batch appears immediately.
      await mutateImports();
      setStep("result");
    } catch { setError("Import failed"); }
    finally { setLoading(false); }
  };

  const rollbackBatch = async (batchId: string) => {
    try {
      const res = await apiFetch(`/api/imports/${batchId}`, { method: "DELETE" });
      if (res.ok) { await mutateImports(); }
      else {
        setError(await extractApiError(res));
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
    setMappingConfidence({ date: 0, amount: 0, description: 0, category: 0, vendor: 0, notes: 0, externalId: 0 });
    setPreview([]);
    setFundingPreview([]);
    setResult(null);
    setError(null);
    setImportProgress(0);
    setEditingRow(null);
  };

  const { fmtDate } = useLocale();
  const fmtCurrency = (n: number) => formatCurrency(n, currency);

  const activePreview = preview.filter((t) => !t.isDuplicate && !t._excluded);

  return (
    <div>
      {/* Header — hidden when embedded in Data Room */}
      {!embedded && (
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-surface-50">
              {target === "funding-rounds" ? "Import Funding Rounds" : "Import Transactions"}
            </h1>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              Upload bank statements, connect accounts, or import spreadsheets
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="sm" icon={<History className="h-4 w-4" />}
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) void mutateImports(); }}>
              History
            </Button>
            {/* TODO: Bank Sync — future release */}
          </div>
        </div>
      )}

      {/* History / Bank Sync toggle buttons when embedded */}
      {embedded && (
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" icon={<History className="h-4 w-4" />}
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) void mutateImports(); }}>
            History
          </Button>
          {/* TODO: Bank Sync — future release */}
        </div>
      )}

      {showHistory && historyError ? (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-950 dark:text-danger-300">
          <span>{toUserMessage(historyError)}</span>
          <Button variant="ghost" size="sm" onClick={() => void mutateImports()}>
            Retry
          </Button>
        </div>
      ) : showHistory ? (
        <ImportHistoryPanel history={history} historyLoading={historyLoading}
          setShowHistory={setShowHistory} rollbackBatch={rollbackBatch} />
      ) : null}
      {/* TODO: Bank Sync — future release */}

      {/* Target selector — only visible on upload step (changing mid-flow would reset state) */}
      {step === "upload" && (
        <div className="mb-4 flex items-center gap-3">
          <label htmlFor="import-target" className="text-sm font-medium text-surface-700 dark:text-surface-300 shrink-0">
            Import type
          </label>
          <Select
            id="import-target"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value as ImportTarget);
              // Reset mapping so it re-auto-maps on next file pick
              setMapping({ date: "", amount: "", description: "", category: "" });
              setFundingPreview([]);
            }}
          >
            <option value="transactions">Transactions</option>
            <option value="funding-rounds">Funding Rounds</option>
          </Select>
        </div>
      )}

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
      {step === "preview" && target === "funding-rounds" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-surface-900 dark:text-surface-50">
                Funding Rounds Preview
              </h2>
              <p className="text-sm text-surface-500 dark:text-surface-400">
                {fundingPreview.length} round{fundingPreview.length !== 1 ? "s" : ""} to import
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("map")}>Back</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={executeImport}
                disabled={loading || fundingPreview.length === 0}
              >
                {loading ? "Importing…" : `Import ${fundingPreview.length} Round${fundingPreview.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-50 dark:bg-surface-800">
                <tr>
                  {["Name", "Type", "Amount", "Date", "Valuation Cap"].map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700 bg-white dark:bg-surface-900">
                {fundingPreview.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-surface-400 dark:text-surface-500">
                      No rows to import
                    </td>
                  </tr>
                ) : (
                  fundingPreview.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-800">
                      <td className="px-3 py-2 font-medium text-surface-900 dark:text-surface-50">{String(row.name ?? "")}</td>
                      <td className="px-3 py-2 text-surface-600 dark:text-surface-300">{String(row.type ?? "")}</td>
                      <td className="px-3 py-2 text-surface-600 dark:text-surface-300">{fmtCurrency(Number(row.amount ?? 0))}</td>
                      <td className="px-3 py-2 text-surface-600 dark:text-surface-300">{row.date ? fmtDate(String(row.date)) : ""}</td>
                      <td className="px-3 py-2 text-surface-600 dark:text-surface-300">
                        {row.parameters && typeof row.parameters === "object" && "valuationCap" in (row.parameters as object)
                          ? fmtCurrency(Number((row.parameters as Record<string, unknown>).valuationCap ?? 0))
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {step === "preview" && target === "transactions" && (
        <PreviewStep preview={preview} activePreview={activePreview} loading={loading}
          importProgress={importProgress} editingRow={editingRow} setEditingRow={setEditingRow}
          toggleRowExclusion={toggleRowExclusion} updatePreviewRow={updatePreviewRow}
          executeImport={executeImport} formatCurrency={fmtCurrency} setStep={setStep}
          amountSynthesized={typeof mapping.amount === "object"} />
      )}
      {step === "result" && result && (
        <ResultStep result={result} reset={reset} rollbackBatch={rollbackBatch} />
      )}
    </div>
  );
}
