"use client";

import { forwardRef, useImperativeHandle } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import {
  RevenueStreamForm,
  type RevenueStreamFormValues,
} from "@/app/(dashboard)/revenue/revenue-stream-form";
import { DraftCard } from "../draft-card";
import type { WizardStepHandle } from "../types";
import { useDraftList } from "../use-draft-list";

interface RevenueStepProps {
  suggestions?: RevenueStreamFormValues[];
}

/**
 * Wizard step 2 — Revenue. Hosts the real (already-controlled) RevenueStreamForm.
 * AI revenue suggestions render as DraftCards; Add/Edit opens the form; saving
 * POSTs /api/revenue-streams (the company already exists by this step), edits of a
 * saved row PATCH /api/revenue-streams/{id}.
 *
 * #7 auto-save-on-Continue: `submit()` (the WizardStepHandle) flushes every
 * un-saved draft via the create endpoint before advancing.
 * #5: saved rows expose Edit (re-open form → PATCH).
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 2).
 */
export const RevenueStep = forwardRef<WizardStepHandle, RevenueStepProps>(
  function RevenueStep({ suggestions = [] }, ref) {
  const api = useDraftList<RevenueStreamFormValues>({
    suggestions,
    create: async (values) => {
      const res = await apiFetch("/api/revenue-streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      const body = (await res.json()) as { id: string };
      return body.id;
    },
    update: async (id, values) => {
      const res = await apiFetch(`/api/revenue-streams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
    },
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
            {mode.kind === "edit" ? "Edit revenue stream" : "Add a revenue stream"}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Model how this stream earns. We&apos;ll save it to your workspace.
          </p>
        </div>
        <RevenueStreamForm
          mode={mode.kind === "edit" ? "edit" : "add"}
          initial={editing?.values}
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
          Revenue
        </h2>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          Add the ways your company makes money. Edit a suggestion or start fresh.
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
                title={item.values.name}
                meta="Saved"
                onEdit={() => api.openEdit(item.key)}
              />
            ) : (
              <DraftCard
                key={item.key}
                title={item.values.name}
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
        Add a revenue stream
      </button>
    </div>
  );
});
