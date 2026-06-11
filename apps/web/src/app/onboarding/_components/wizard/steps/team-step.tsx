"use client";

import { forwardRef, useImperativeHandle } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import { HeadcountFormBody } from "@/app/(dashboard)/team/headcount-form-body";
import type { EditableHeadcount } from "@/app/(dashboard)/team/headcount-form";
import type { BenefitsBreakdown } from "@/lib/headcount-params";
import { normalizeHeadcountPayload } from "@/lib/headcount-params";
import { DraftCard } from "../draft-card";
import type { WizardStepHandle } from "../types";
import { useDraftList } from "../use-draft-list";

type HeadcountPayload = ReturnType<typeof normalizeHeadcountPayload>;

interface TeamStepProps {
  suggestions?: EditableHeadcount[];
  departments: { id: string; name: string }[];
  companyBenefitsRates?: BenefitsBreakdown;
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
 * Normalize a stored `EditableHeadcount` (suggestion or re-stored row) into the
 * schema-valid `/api/headcount` payload. Mirrors `HeadcountFormBody`'s own
 * `EditableHeadcount → HeadcountFormState → normalizeHeadcountPayload` path so an
 * AI draft flushed on Continue (#7, never opened in the form) POSTs the same shape
 * the form would have produced (clean numbers, no `null` parameters).
 */
function editableToPayload(e: EditableHeadcount): HeadcountPayload {
  return normalizeHeadcountPayload({
    title: e.title,
    name: e.name ?? "",
    employeeType: e.employeeType,
    count: toNum(e.count, 1),
    salary: toNum(e.salary, 0),
    hourlyRate: toNumOrNull(e.hourlyRate),
    hoursPerWeek: toNumOrNull(e.hoursPerWeek),
    startDate: e.startDate.slice(0, 10),
    endDate: e.endDate ? e.endDate.slice(0, 10) : null,
    departmentId: e.departmentId,
    benefitsRate: toNum(e.benefitsRate, 0.2),
    benefitsBreakdown: e.parameters?.benefitsBreakdown ?? {},
  });
}

/**
 * Map the form's normalized payload back to an `EditableHeadcount` for re-edit
 * (#5) — preserves enough to re-open the form prefilled.
 */
function payloadToEditable(p: HeadcountPayload): EditableHeadcount {
  const params = (p.parameters ?? {}) as { benefitsBreakdown?: BenefitsBreakdown };
  return {
    id: "",
    departmentId: String(p.departmentId ?? ""),
    title: String(p.title ?? ""),
    name: (p.name as string | null) ?? null,
    employeeType: p.employeeType as EditableHeadcount["employeeType"],
    count: (p.count as number) ?? 1,
    salary: (p.salary as number) ?? 0,
    hourlyRate: (p.hourlyRate as number | null) ?? null,
    hoursPerWeek: (p.hoursPerWeek as number | null) ?? null,
    startDate: String(p.startDate ?? ""),
    endDate: (p.endDate as string | null) ?? null,
    benefitsRate: (p.benefitsRate as number) ?? 0.2,
    parameters: params.benefitsBreakdown ? { benefitsBreakdown: params.benefitsBreakdown } : null,
  };
}

/**
 * Wizard step 5 — Team. Hosts the real (Phase A) controlled HeadcountFormBody,
 * populated with the company's default departments (threaded from the page after
 * company creation). AI headcount-role suggestions render as DraftCards.
 *
 * #7 auto-save-on-Continue: `submit()` flushes every un-saved draft → POST
 * `/api/headcount`. #5: saved rows expose Edit (re-open form → PATCH
 * `/api/headcount/{id}`).
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 5).
 */
export const TeamStep = forwardRef<WizardStepHandle, TeamStepProps>(
  function TeamStep({ suggestions = [], departments, companyBenefitsRates }, ref) {
  const api = useDraftList<EditableHeadcount, HeadcountPayload>({
    suggestions,
    create: async (values) => {
      const res = await apiFetch("/api/headcount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editableToPayload(values)),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      const body = (await res.json()) as { id: string };
      return body.id;
    },
    update: async (id, values) => {
      const res = await apiFetch(`/api/headcount/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editableToPayload(values)),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
    },
    toStored: payloadToEditable,
  });

  // #7: Continue auto-saves every un-saved draft (POST each) before advancing.
  useImperativeHandle(ref, () => ({ submit: api.flush }), [api.flush]);

  const mode = api.mode;
  if (mode.kind !== "list") {
    const editing =
      mode.kind === "edit"
        ? api.items.find((it) => it.key === mode.key)
        : undefined;
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            {mode.kind === "edit" ? "Edit hire" : "Add a hire"}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Plan a role and its cost. We&apos;ll save it to your workspace.
          </p>
        </div>
        <HeadcountFormBody
          departments={departments}
          companyBenefitsRates={companyBenefitsRates}
          initial={editing?.values}
          submitLabel="Save hire"
          onSubmit={api.save}
          onCancel={api.cancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
          Team
        </h2>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          Add the people you&apos;re planning to hire. Edit a suggestion or start fresh.
        </p>
      </div>

      {api.error && (
        <div
          role="alert"
          className="rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2 text-xs text-danger-600"
        >
          {api.error}
        </div>
      )}

      {api.items.length > 0 && (
        <div>
          {api.items.map((item) =>
            item.saved ? (
              <DraftCard
                key={item.key}
                title={item.values.title}
                meta="Saved"
                onEdit={() => api.openEdit(item.key)}
              />
            ) : (
              <DraftCard
                key={item.key}
                title={item.values.title}
                meta={departments.find((dep) => dep.id === item.values.departmentId)?.name}
                ai
                onEdit={() => api.openEdit(item.key)}
                onRemove={() => api.removeDraft(item.key)}
              />
            ),
          )}
        </div>
      )}

      <button
        type="button"
        onClick={api.openAdd}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-300 px-4 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:border-brand-400 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800"
      >
        <Plus className="h-4 w-4" />
        Add a hire
      </button>
    </div>
  );
});
