"use client";

import { Sparkles, Check, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { confidenceColor, confidenceLabel, getAmountColumn } from "./import-utils";
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
  const amountCol = getAmountColumn(mapping);
  const isSplitAmount = typeof mapping.amount === "object";
  const amountReady = isSplitAmount
    ? !!(mapping.amount as { debit: string; credit: string }).debit &&
      !!(mapping.amount as { debit: string; credit: string }).credit
    : !!amountCol;
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
          {/* Date — required */}
          <SimpleSelectRow
            label="Date column"
            required
            value={mapping.date}
            confidence={mappingConfidence.date}
            headers={headers}
            onChange={(v) => {
              setMapping((m) => ({ ...m, date: v }));
              setMappingConfidence((c) => ({ ...c, date: v ? 1 : 0 }));
            }}
          />

          {/* Amount — single column OR debit/credit pair */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                Amount column{" "}
                <span className="text-danger-500">*</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSplitAmount}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMapping((m) => ({ ...m, amount: { debit: "", credit: "" } }));
                    } else {
                      setMapping((m) => ({ ...m, amount: "" }));
                    }
                    setMappingConfidence((c) => ({ ...c, amount: 0 }));
                  }}
                  className="h-3.5 w-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Source has separate Debit and Credit columns
              </label>
            </div>
            {isSplitAmount ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={(mapping.amount as { debit: string; credit: string }).debit}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        amount: {
                          ...(m.amount as { debit: string; credit: string }),
                          debit: e.target.value,
                        },
                      }))
                    }
                    aria-label="Debit column"
                    className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Debit column...</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    value={(mapping.amount as { debit: string; credit: string }).credit}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        amount: {
                          ...(m.amount as { debit: string; credit: string }),
                          credit: e.target.value,
                        },
                      }))
                    }
                    aria-label="Credit column"
                    className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Credit column...</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-xs text-surface-500 dark:text-surface-400">
                  Amount will be synthesized as: credit &minus; debit
                </p>
              </>
            ) : (
              <select
                value={amountCol ?? ""}
                onChange={(e) => {
                  setMapping((m) => ({ ...m, amount: e.target.value }));
                  setMappingConfidence((c) => ({ ...c, amount: e.target.value ? 1 : 0 }));
                }}
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-surface-0 dark:bg-surface-900 text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                  amountCol && mappingConfidence.amount >= 0.8
                    ? "border-success-300 dark:border-success-700"
                    : amountCol && mappingConfidence.amount >= 0.5
                      ? "border-warning-300 dark:border-warning-700"
                      : "border-surface-300 dark:border-surface-600"
                }`}
              >
                <option value="">Select column...</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            )}
          </div>

          {/* Description — optional */}
          <SimpleSelectRow
            label="Description column"
            value={mapping.description}
            confidence={mappingConfidence.description}
            headers={headers}
            onChange={(v) => {
              setMapping((m) => ({ ...m, description: v }));
              setMappingConfidence((c) => ({ ...c, description: v ? 1 : 0 }));
            }}
          />

          {/* Category — optional */}
          <SimpleSelectRow
            label="Category column"
            value={mapping.category}
            confidence={mappingConfidence.category}
            headers={headers}
            onChange={(v) => {
              setMapping((m) => ({ ...m, category: v }));
              setMappingConfidence((c) => ({ ...c, category: v ? 1 : 0 }));
            }}
          />

          {/* Vendor — optional */}
          <SimpleSelectRow
            label="Vendor / Merchant column"
            value={mapping.vendor ?? ""}
            confidence={mappingConfidence.vendor}
            headers={headers}
            onChange={(v) => {
              setMapping((m) => ({ ...m, vendor: v || undefined }));
              setMappingConfidence((c) => ({ ...c, vendor: v ? 1 : 0 }));
            }}
          />

          {/* Notes — optional */}
          <SimpleSelectRow
            label="Notes / Memo column"
            value={mapping.notes ?? ""}
            confidence={mappingConfidence.notes}
            headers={headers}
            onChange={(v) => {
              setMapping((m) => ({ ...m, notes: v || undefined }));
              setMappingConfidence((c) => ({ ...c, notes: v ? 1 : 0 }));
            }}
          />

          {/* External ID — optional */}
          <SimpleSelectRow
            label="Transaction ID / Reference column"
            value={mapping.externalId ?? ""}
            confidence={mappingConfidence.externalId}
            headers={headers}
            onChange={(v) => {
              setMapping((m) => ({ ...m, externalId: v || undefined }));
              setMappingConfidence((c) => ({ ...c, externalId: v ? 1 : 0 }));
            }}
          />

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
      {mapping.date && amountReady && (
        <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-3">
            Sample data (first 5 rows)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 dark:border-surface-700">
                  <th scope="col" className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Date</th>
                  <th scope="col" className="text-right py-2 px-3 font-medium text-surface-600 dark:text-surface-400">
                    {isSplitAmount ? "Amount (credit \u2212 debit)" : "Amount"}
                  </th>
                  <th scope="col" className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Description</th>
                  {mapping.category && (
                    <th scope="col" className="text-left py-2 px-3 font-medium text-surface-600 dark:text-surface-400">Category</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => {
                  let amountDisplay = "\u2014";
                  if (isSplitAmount) {
                    const { debit, credit } = mapping.amount as { debit: string; credit: string };
                    const d = parseFloat((row[debit] ?? "0").replace(/[$,\u20ac\u00a3()]/g, "")) || 0;
                    const c = parseFloat((row[credit] ?? "0").replace(/[$,\u20ac\u00a3()]/g, "")) || 0;
                    amountDisplay = (c - d).toFixed(2);
                  } else if (amountCol && row[amountCol]) {
                    amountDisplay = row[amountCol]!;
                  }
                  return (
                    <tr key={i} className="border-b border-surface-100 dark:border-surface-700/50">
                      <td className="py-2 px-3 text-surface-900 dark:text-surface-50">{row[mapping.date] || "\u2014"}</td>
                      <td className="py-2 px-3 text-right font-mono text-surface-900 dark:text-surface-50">{amountDisplay}</td>
                      <td className="py-2 px-3 text-surface-600 dark:text-surface-400 max-w-xs truncate">
                        {mapping.description ? row[mapping.description] || "\u2014" : "\u2014"}
                      </td>
                      {mapping.category && (
                        <td className="py-2 px-3 text-surface-600 dark:text-surface-400">{row[mapping.category] || "\u2014"}</td>
                      )}
                    </tr>
                  );
                })}
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
          disabled={!mapping.date || !amountReady || !targetAccountId}
          onClick={generatePreview}
        >
          Preview Import
        </Button>
      </div>
    </div>
  );
}

interface SimpleSelectRowProps {
  label: string;
  required?: boolean;
  value: string;
  confidence: number;
  headers: string[];
  onChange: (value: string) => void;
}

function SimpleSelectRow({
  label,
  required = false,
  value,
  confidence,
  headers,
  onChange,
}: SimpleSelectRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}{" "}
          {required ? (
            <span className="text-danger-500">*</span>
          ) : (
            <span className="text-surface-400">(optional)</span>
          )}
        </label>
        {value && confidence > 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceColor(confidence)}`}
          >
            {confidence >= 0.8 ? <Check className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
            {confidenceLabel(confidence)}
          </span>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm bg-surface-0 dark:bg-surface-900 text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
          value && confidence >= 0.8
            ? "border-success-300 dark:border-success-700"
            : value && confidence >= 0.5
              ? "border-warning-300 dark:border-warning-700"
              : "border-surface-300 dark:border-surface-600"
        }`}
      >
        <option value="">{required ? "Select column..." : "(none)"}</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );
}
