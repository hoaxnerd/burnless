"use client";

import { useState, useEffect, useMemo } from "react";
import { Input, Select } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";
import {
  defaultHeadcountForm,
  validateHeadcountForm,
  normalizeHeadcountPayload,
  type HeadcountFormState,
  type BenefitsBreakdown,
} from "@/lib/headcount-params";
import { FullTimeFields } from "./employee-type-fields/FullTimeFields";
import { PartTimeFields } from "./employee-type-fields/PartTimeFields";
import { ContractorFields } from "./employee-type-fields/ContractorFields";
import { BenefitsBreakdownEditor } from "./benefits-breakdown-editor";
import { DateRangePicker } from "@/components/forms/primitives";
import type { EditableHeadcount } from "./headcount-form";

export interface HeadcountFormBodyProps {
  departments: { id: string; name: string }[];
  companyBenefitsRates?: BenefitsBreakdown;
  /** present = edit-mode defaults; absent = add defaults */
  initial?: EditableHeadcount;
  onSubmit: (payload: ReturnType<typeof normalizeHeadcountPayload>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

function toNum(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

function toNumOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Controlled field body for headcount add/edit. Owns local form state +
 * validation, but delegates persistence to `onSubmit`. No <Modal>, no apiFetch,
 * no router — the caller (HeadcountForm wrapper, onboarding wizard) supplies those.
 */
export function HeadcountFormBody({
  departments,
  companyBenefitsRates,
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Add hire",
}: HeadcountFormBodyProps) {
  const initialState = useMemo<HeadcountFormState>(() => {
    if (!initial) {
      return defaultHeadcountForm({
        departmentId: departments[0]?.id ?? "",
        companyDefaults: companyBenefitsRates,
      });
    }
    return {
      title: initial.title,
      name: initial.name ?? "",
      employeeType: initial.employeeType,
      count: toNum(initial.count, 1),
      salary: toNum(initial.salary, 0),
      hourlyRate: toNumOrNull(initial.hourlyRate),
      hoursPerWeek: toNumOrNull(initial.hoursPerWeek),
      startDate: initial.startDate.slice(0, 10),
      endDate: initial.endDate ? initial.endDate.slice(0, 10) : null,
      departmentId: initial.departmentId,
      benefitsRate: toNum(initial.benefitsRate, 0.2),
      benefitsBreakdown: initial.parameters?.benefitsBreakdown ?? {},
    };
  }, [initial, departments, companyBenefitsRates]);

  const [state, setState] = useState<HeadcountFormState>(initialState);
  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onChange = (partial: Partial<HeadcountFormState>) => {
    setState((s) => ({ ...s, ...partial }));
  };

  async function handleSubmit() {
    const v = validateHeadcountForm(state);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    setSubmitError(null);
    try {
      const payload = normalizeHeadcountPayload(state);
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Input
        label="Title"
        value={state.title}
        onChange={(e) => onChange({ title: e.target.value })}
        error={errors.title}
      />

      <Input
        label="Name"
        showOptional
        value={state.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />

      <Select
        label="Department"
        value={state.departmentId}
        onChange={(e) => onChange({ departmentId: e.target.value })}
        error={errors.departmentId}
      >
        <option value="">Select…</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>

      <Select
        label="Employee type"
        value={state.employeeType}
        onChange={(e) =>
          onChange({
            employeeType: e.target.value as HeadcountFormState["employeeType"],
          })
        }
        data-testid="employee-type-select"
      >
        <option value="full_time">Full-time</option>
        <option value="part_time">Part-time</option>
        <option value="contractor">Contractor</option>
      </Select>

      {state.employeeType === "full_time" && (
        <FullTimeFields state={state} errors={errors} onChange={onChange} />
      )}
      {state.employeeType === "part_time" && (
        <PartTimeFields state={state} errors={errors} onChange={onChange} />
      )}
      {state.employeeType === "contractor" && (
        <ContractorFields state={state} errors={errors} onChange={onChange} />
      )}

      <DateRangePicker
        startDate={state.startDate}
        endDate={state.endDate}
        onChange={({ startDate, endDate }) => onChange({ startDate, endDate })}
        required
      />

      <fieldset className="rounded-lg border border-surface-200 p-3">
        <legend className="px-1 text-xs font-medium text-surface-700">Benefits breakdown</legend>
        <BenefitsBreakdownEditor
          value={state.benefitsBreakdown}
          companyDefaults={companyBenefitsRates ?? {}}
          onChange={(next) => onChange({ benefitsBreakdown: next })}
        />
      </fieldset>

      {submitError && (
        <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600 form-error">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          data-testid="save-headcount"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
