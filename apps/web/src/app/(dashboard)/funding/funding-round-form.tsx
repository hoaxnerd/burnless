"use client";

import { useState, type FormEvent } from "react";
import { CurrencyInput, DateRangePicker } from "@/components/forms/primitives";
import { Input, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError, toUserMessage } from "@/lib/api-error";
import {
  defaultParamsForType,
  normalizePayload,
  validateParams,
} from "@/lib/funding-params";
import type { FundingRoundType } from "@burnless/engine";
import { EquityFields } from "./round-fields/EquityFields";
import { SafeFields } from "./round-fields/SafeFields";
import { ConvertibleFields } from "./round-fields/ConvertibleFields";
import { DebtFields } from "./round-fields/DebtFields";
import { GrantFields } from "./round-fields/GrantFields";

const today = new Date().toISOString().slice(0, 10);

export interface FundingRoundFormValues {
  name: string;
  roundType: FundingRoundType;
  amount: number;
  date: string;
  closeDate: string | null;
  notes: string | null;
  parameters: Record<string, unknown>;
  isProjected: boolean;
}

interface FundingRoundFormProps {
  mode: "add" | "edit";
  initial?: Partial<FundingRoundFormValues> & { id?: string };
  onClose: () => void;
}

export function FundingRoundForm({ mode, initial, onClose }: FundingRoundFormProps) {
  const [values, setValues] = useState<FundingRoundFormValues>(() => {
    const roundType = (initial?.roundType ?? "seed") as FundingRoundType;
    return {
      name: initial?.name ?? "",
      roundType,
      amount: initial?.amount ?? 0,
      date: initial?.date ?? today,
      closeDate: initial?.closeDate ?? null,
      notes: initial?.notes ?? null,
      parameters: initial?.parameters ?? defaultParamsForType(roundType),
      isProjected: initial?.isProjected ?? false,
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setType = (next: FundingRoundType) =>
    setValues((v) => ({ ...v, roundType: next, parameters: defaultParamsForType(next) }));

  const setParameters = (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) => setValues((v) => ({ ...v, parameters: updater(v.parameters) }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationError = validateParams(values.roundType, values.parameters);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: values.name,
        ...(mode === "add" ? { roundType: values.roundType } : {}), // Phase 2 D §1.5 D2: omit roundType on edit
        amount: values.amount,
        date: values.date,
        closeDate: values.closeDate,
        notes: values.notes,
        parameters: normalizePayload(values.roundType, values.parameters),
        isProjected: values.isProjected,
      };
      const url =
        mode === "add"
          ? "/api/funding-rounds"
          : `/api/funding-rounds/${(initial as any).id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(await extractApiError(res));
      }
      onClose();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const FieldsComponent = {
    pre_seed: EquityFields, seed: EquityFields, series_a: EquityFields,
    series_b: EquityFields, series_c_plus: EquityFields,
    safe: SafeFields, convertible: ConvertibleFields,
    debt: DebtFields, grant: GrantFields,
  }[values.roundType];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Round name"
        required
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
      />

      {mode === "edit" ? (
        <div>
          <span className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
            Round type
          </span>
          <div className="text-sm text-muted">
            {values.roundType} (immutable)
          </div>
        </div>
      ) : (
        <Select
          label="Round type"
          value={values.roundType}
          onChange={(e) => setType(e.target.value as FundingRoundType)}
        >
          <option value="pre_seed">Pre-seed</option>
          <option value="seed">Seed</option>
          <option value="series_a">Series A</option>
          <option value="series_b">Series B</option>
          <option value="series_c_plus">Series C+</option>
          <option value="safe">SAFE</option>
          <option value="convertible">Convertible Note</option>
          <option value="debt">Debt</option>
          <option value="grant">Grant</option>
        </Select>
      )}

      <CurrencyInput
        value={values.amount}
        onChange={(v) => setValues((vv) => ({ ...vv, amount: v }))}
        label="Total amount"
        required
      />

      <DateRangePicker
        startDate={values.date}
        endDate={values.closeDate}
        onChange={({ startDate, endDate }) =>
          setValues((v) => ({ ...v, date: startDate, closeDate: endDate }))
        }
        startLabel="Signing date"
        endLabel="Close date (optional — when cash hits)"
      />

      <FieldsComponent params={values.parameters as any} setParameters={setParameters} />

      <Textarea
        placeholder="Notes (optional)"
        value={values.notes ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value || null }))}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.isProjected}
          onChange={(e) => setValues((v) => ({ ...v, isProjected: e.target.checked }))}
        />
        Projected (not yet closed)
      </label>

      {error && <div className="text-danger text-sm">{error}</div>}

      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
