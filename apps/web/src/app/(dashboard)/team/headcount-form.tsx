"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal, Input, Select } from "@/components/ui";
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

/**
 * Canonical label for the add-headcount action. Empty-state copy MUST reference
 * this so the call-to-action text can't drift from the real button (SHELL-05 / TEAM-10).
 */
export const ADD_HIRE_LABEL = "Add hire";

interface Department {
  id: string;
  name: string;
}

export interface EditableHeadcount {
  id: string;
  departmentId: string;
  title: string;
  name?: string | null;
  employeeType: "full_time" | "part_time" | "contractor";
  count: number | string;
  salary: string | number;
  hourlyRate: string | number | null;
  hoursPerWeek: string | number | null;
  startDate: string;
  endDate?: string | null;
  benefitsRate: string | number;
  parameters?: { benefitsBreakdown?: BenefitsBreakdown } | null;
}

interface Props {
  departments: Department[];
  companyBenefitsRates?: BenefitsBreakdown;
  edit?: EditableHeadcount;
  open?: boolean;
  onClose?: () => void;
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
 * Consolidated add/edit form for headcount entries.
 * Replaces the legacy <AddHireForm>/<EditHireForm> pair (Phase 1 §1.7, §2.E).
 * Task 22 will wire this into the team page and remove the legacy forms.
 */
export function HeadcountForm({
  departments,
  companyBenefitsRates,
  edit,
  open: controlledOpen,
  onClose,
}: Props) {
  const router = useRouter();
  const isEditMode = !!edit;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  const initialState = useMemo<HeadcountFormState>(() => {
    if (!edit) {
      return defaultHeadcountForm({
        departmentId: departments[0]?.id ?? "",
        companyDefaults: companyBenefitsRates,
      });
    }
    return {
      title: edit.title,
      name: edit.name ?? "",
      employeeType: edit.employeeType,
      count: toNum(edit.count, 1),
      salary: toNum(edit.salary, 0),
      hourlyRate: toNumOrNull(edit.hourlyRate),
      hoursPerWeek: toNumOrNull(edit.hoursPerWeek),
      startDate: edit.startDate.slice(0, 10),
      endDate: edit.endDate ? edit.endDate.slice(0, 10) : null,
      departmentId: edit.departmentId,
      benefitsRate: toNum(edit.benefitsRate, 0.2),
      benefitsBreakdown: edit.parameters?.benefitsBreakdown ?? {},
    };
  }, [edit, departments, companyBenefitsRates]);

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

  function handleClose() {
    if (controlledOpen === undefined) setInternalOpen(false);
    onClose?.();
    setErrors({});
    setSubmitError(null);
  }

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
      const url = isEditMode ? `/api/headcount/${edit!.id}` : `/api/headcount`;
      const method = isEditMode ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(toUserMessage(body));
        return;
      }
      handleClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {controlledOpen === undefined && (
        <button
          type="button"
          onClick={() => setInternalOpen(true)}
          data-testid="open-headcount-form"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          {ADD_HIRE_LABEL}
        </button>
      )}
      <Modal open={open} onClose={handleClose} title={isEditMode ? "Edit hire" : "Add hire"} size="xl">
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
              onClick={handleClose}
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
              {saving ? "Saving…" : isEditMode ? "Save changes" : "Add hire"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
