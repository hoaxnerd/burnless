"use client";

/**
 * Consolidated <ExpenseForm> — replaces the legacy add-expense-form.tsx and
 * edit-expense-form.tsx. Single component with `mode: "add" | "edit"`.
 *
 * Phase 1 §1.7 / §2.C. Wires up Phase-1 fields (vendor, notes, frequency,
 * isOneTime, isRecurring tri-state, departmentId, endDate) and produces an
 * engine-aligned payload via `normalizeExpensePayload` from
 * `@/lib/expense-params`.
 *
 * Method switching resets `parameters` to `defaultParamsForMethod(newMethod)`
 * to avoid leaking foreign keys past the strict per-method Zod schemas.
 *
 * NOTE: For Task 7 this component is created and tested in isolation; rewiring
 * `expenses-view.tsx` happens in Task 10/11/15.
 */

import { useState, useMemo, useCallback } from "react";
import {
  type ForecastMethod,
  defaultParamsForMethod,
  validateExpenseParams,
  normalizeExpensePayload,
  type ExpensePayloadNormalized,
} from "@/lib/expense-params";
import { getCategorySubcategories } from "@burnless/engine";
import { FrequencySelector, type Frequency } from "./components/FrequencySelector";
import { DateRangePicker } from "@/components/forms/primitives";
import { Input, Select, Textarea } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";
import { FixedFields } from "./forecast-method-fields/FixedFields";
import { GrowthRateFields } from "./forecast-method-fields/GrowthRateFields";
import { PerUnitFields } from "./forecast-method-fields/PerUnitFields";
import { PercentageOfFields } from "./forecast-method-fields/PercentageOfFields";
import { CustomFormulaFields } from "./forecast-method-fields/CustomFormulaFields";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExpenseRow {
  id: string;
  accountId: string;
  method: ForecastMethod;
  parameters: Record<string, unknown>;
  startDate: string | Date;
  endDate: string | Date | null;
  vendor?: string | null;
  notes?: string | null;
  /** Explicit per-line category override; null/"" = derive from account. */
  subcategory?: string | null;
  frequency?: Frequency | null;
  isOneTime?: boolean | null;
  isRecurring?: boolean | null;
  departmentId?: string | null;
}

export type ExpenseSubmitPayload = ExpensePayloadNormalized;

interface ExpenseFormProps {
  mode: "add" | "edit";
  initialValue?: ExpenseRow;
  accounts: Array<{ id: string; name: string }>;
  departments?: Array<{ id: string; name: string }>;
  forecastLines?: Array<{ id: string; name: string }>;
  onSubmit: (payload: ExpenseSubmitPayload) => Promise<void>;
  onCancel: () => void;
}

const METHODS: Array<{ value: ForecastMethod; label: string }> = [
  { value: "fixed", label: "Fixed Amount" },
  { value: "growth_rate", label: "Growth Rate" },
  { value: "per_unit", label: "Per Unit" },
  { value: "percentage_of", label: "Percentage Of" },
  { value: "custom_formula", label: "Custom Formula" },
];

// ── Single recurring choice ──────────────────────────────────────────────────
// Replaces the old "isRecurring tri-state radio + standalone isOneTime checkbox"
// pair that could be set contradictorily (EXP-04).
//
// Mapping to DB columns:
//   'auto'      → isRecurring=null,  isOneTime=false  (auto-detect from variance)
//   'recurring' → isRecurring=true,  isOneTime=false  (user-confirmed recurring)
//   'one-time'  → isRecurring=false, isOneTime=true   (user-confirmed one-off)
//
// Engine independence: isOneTime buckets expenses into oneTimeExpensesSeries;
// isRecurring drives the UI recurring filter. Both columns stay in the schema —
// the single choice derives both from one control.

type RecurringChoice = "auto" | "recurring" | "one-time";

function recurringChoiceFromRow(
  isRecurring: boolean | null | undefined,
  isOneTime: boolean | null | undefined,
): RecurringChoice {
  if (isOneTime) return "one-time";
  if (isRecurring === true) return "recurring";
  return "auto";
}

function recurringChoiceToColumns(c: RecurringChoice): {
  isRecurring: boolean | null;
  isOneTime: boolean;
} {
  if (c === "one-time") return { isRecurring: false, isOneTime: true };
  if (c === "recurring") return { isRecurring: true, isOneTime: false };
  return { isRecurring: null, isOneTime: false };
}

// ── Date coercion helpers ────────────────────────────────────────────────────

function toDate(v: string | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultStartDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
}

/**
 * Format a Date as a YYYY-MM-DD ISO day-string using UTC components.
 * Used to adapt the form's `Date | null` state to the canonical
 * `<DateRangePicker>`'s ISO-string prop boundary (Phase 3 F §F4).
 */
function dateToIsoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ExpenseForm({
  mode,
  initialValue,
  accounts,
  departments,
  forecastLines,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  // Pre-populate from initialValue (edit mode) or sensible defaults (add mode).
  const [accountId, setAccountId] = useState<string>(
    initialValue?.accountId ?? (accounts[0]?.id ?? ""),
  );
  const [method, setMethod] = useState<ForecastMethod>(initialValue?.method ?? "fixed");
  const [parameters, setParameters] = useState<Record<string, unknown>>(() => {
    if (initialValue?.parameters && Object.keys(initialValue.parameters).length > 0) {
      return { ...initialValue.parameters };
    }
    return defaultParamsForMethod(initialValue?.method ?? "fixed");
  });
  // Held as Date (not ISO string) — normalizeExpensePayload + submit validation expect Date | null.
  const [startDate, setStartDate] = useState<Date | null>(
    () => toDate(initialValue?.startDate) ?? defaultStartDate(),
  );
  const [endDate, setEndDate] = useState<Date | null>(() => toDate(initialValue?.endDate ?? null));
  const [frequency, setFrequency] = useState<Frequency>(
    (initialValue?.frequency as Frequency | undefined) ?? "monthly",
  );
  const [recurringChoice, setRecurringChoice] = useState<RecurringChoice>(
    recurringChoiceFromRow(initialValue?.isRecurring, initialValue?.isOneTime),
  );
  const [departmentId, setDepartmentId] = useState<string>(initialValue?.departmentId ?? "");
  const [vendor, setVendor] = useState<string>(initialValue?.vendor ?? "");
  const [notes, setNotes] = useState<string>(initialValue?.notes ?? "");
  // "" = Auto (derive from account); a value = explicit per-line override.
  const [subcategory, setSubcategory] = useState<string>(initialValue?.subcategory ?? "");

  // Full canonical subcategory list (~100 rules). If the edit row carries a
  // custom value not in that list, include it so it stays selectable.
  const categoryOptions = useMemo(() => {
    const canonical = getCategorySubcategories();
    const current = (initialValue?.subcategory ?? "").trim();
    if (current !== "" && !canonical.includes(current)) {
      return [current, ...canonical];
    }
    return canonical;
  }, [initialValue?.subcategory]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isParamsValid = useMemo(() => {
    if (method === "fixed") {
      const amt = parameters.amount as number;
      return typeof amt === "number" && amt > 0;
    }
    const val = validateExpenseParams(method, parameters);
    return val.success;
  }, [method, parameters]);

  const isValid = accountId !== "" && startDate !== null && isParamsValid;

  // Switching method MUST reset parameters to the new method's defaults so
  // foreign keys from the previous method don't leak past `.strict()` Zod.
  const handleMethodChange = useCallback((next: ForecastMethod) => {
    setMethod(next);
    setParameters(defaultParamsForMethod(next));
    setParamsError(null);
  }, []);

  // Filter the current line out of the percentage_of source dropdown (no self-ref).
  const sourceLines = useMemo(() => {
    const all = forecastLines ?? [];
    if (mode === "edit" && initialValue?.id) {
      return all.filter((l) => l.id !== initialValue.id);
    }
    return all;
  }, [forecastLines, mode, initialValue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setParamsError(null);

    if (!accountId) {
      setSubmitError("Account is required.");
      return;
    }
    if (!startDate) {
      setSubmitError("Start date is required.");
      return;
    }

    const validation = validateExpenseParams(method, parameters);
    if (!validation.success) {
      setParamsError(validation.error);
      return;
    }

    const { isRecurring, isOneTime } = recurringChoiceToColumns(recurringChoice);
    const payload = normalizeExpensePayload({
      method,
      parameters,
      startDate,
      endDate,
      frequency,
      isOneTime,
      isRecurring,
      vendor: vendor.trim() === "" ? null : vendor.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
      subcategory: subcategory.trim() === "" ? null : subcategory,
      departmentId: departmentId === "" ? null : departmentId,
      accountId,
      ...(mode === "edit" && initialValue?.id ? { id: initialValue.id } : {}),
    });

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label={mode === "add" ? "Add expense" : "Edit expense"}>
      {submitError && (
        <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="ef-account" className="block text-sm font-medium text-surface-700 mb-1">
          Account
        </label>
        <Select
          id="ef-account"
          value={accountId}
          disabled={mode === "edit"}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Select an account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="ef-category" className="block text-sm font-medium text-surface-700 mb-1">
          Category
        </label>
        <Select
          id="ef-category"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
        >
          <option value="">Auto (derive from account)</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-surface-400">
          Leave on Auto to categorize from the account, or pick a category for this entry.
        </p>
      </div>

      <div>
        <label htmlFor="ef-method" className="block text-sm font-medium text-surface-700 mb-1">
          Forecast method
        </label>
        <Select
          id="ef-method"
          value={method}
          onChange={(e) => handleMethodChange(e.target.value as ForecastMethod)}
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="rounded-lg border border-surface-200 bg-surface-50/50 p-4">
        <MethodFields
          method={method}
          parameters={parameters}
          onChange={(p) => setParameters({ ...p })}
          sourceLines={sourceLines}
        />
        {paramsError && (
          <p className="mt-3 text-xs font-medium text-danger-600" role="alert">
            {paramsError}
          </p>
        )}
      </div>

      {/* Phase 3 F §F4: canonical DateRangePicker (ISO-string boundary). */}
      <DateRangePicker
        startDate={startDate ? dateToIsoDay(startDate) : ""}
        endDate={endDate ? dateToIsoDay(endDate) : null}
        onChange={({ startDate: s, endDate: e }) => {
          setStartDate(s ? new Date(`${s}T00:00:00.000Z`) : null);
          setEndDate(e ? new Date(`${e}T00:00:00.000Z`) : null);
        }}
        required
      />

      <div>
        <label className="block text-sm font-medium text-surface-700 mb-1">Frequency</label>
        <FrequencySelector value={frequency} onChange={setFrequency} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="ef-vendor" className="block text-sm font-medium text-surface-700 mb-1">
            Vendor <span className="text-surface-400 font-normal">(optional)</span>
          </label>
          <Input
            id="ef-vendor"
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. AWS"
          />
        </div>
        {departments && departments.length > 0 && (
          <div>
            <label htmlFor="ef-dept" className="block text-sm font-medium text-surface-700 mb-1">
              Department <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <Select
              id="ef-dept"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="ef-notes" className="block text-sm font-medium text-surface-700 mb-1">
          Notes <span className="text-surface-400 font-normal">(optional)</span>
        </label>
        <Textarea
          id="ef-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes about this expense"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-surface-700">Recurrence</legend>
        <div className="space-y-1.5">
          {(
            [
              { value: "auto", label: "Auto-detect (suggested)" },
              { value: "recurring", label: "Yes, recurring" },
              { value: "one-time", label: "One-time expense (does not recur)" },
            ] as Array<{ value: RecurringChoice; label: string }>
          ).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-surface-700">
              <input
                type="radio"
                name="ef-recurring"
                value={opt.value}
                checked={recurringChoice === opt.value}
                onChange={() => setRecurringChoice(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !isValid}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {submitting
            ? mode === "add"
              ? "Adding…"
              : "Saving…"
            : mode === "add"
              ? "Add Expense"
              : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

// ── Per-method dispatch ──────────────────────────────────────────────────────

interface MethodFieldsProps {
  method: ForecastMethod;
  parameters: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  sourceLines: Array<{ id: string; name: string }>;
}

function MethodFields({ method, parameters, onChange, sourceLines }: MethodFieldsProps) {
  const widen = (p: Record<string, unknown> | object) => onChange({ ...p } as Record<string, unknown>);
  switch (method) {
    case "fixed":
      return <FixedFields params={parameters as { amount: number }} onChange={widen} />;
    case "growth_rate":
      return (
        <GrowthRateFields
          params={parameters as { baseAmount: number; monthlyGrowthRate: number }}
          onChange={widen}
        />
      );
    case "per_unit":
      return (
        <PerUnitFields
          params={
            parameters as {
              units: number;
              pricePerUnit: number;
              unitGrowthRate?: number;
              priceGrowthRate?: number;
            }
          }
          onChange={widen}
        />
      );
    case "percentage_of":
      return (
        <PercentageOfFields
          params={parameters as { sourceLineId: string; percentage: number }}
          onChange={widen}
          lines={sourceLines}
        />
      );
    case "custom_formula":
      return (
        <CustomFormulaFields
          params={
            parameters as {
              expression: string;
              variables?: Record<string, number | string>;
            }
          }
          onChange={widen}
        />
      );
  }
}
