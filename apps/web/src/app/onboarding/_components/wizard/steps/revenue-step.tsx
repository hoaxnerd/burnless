"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import {
  RevenueStreamForm,
  type RevenueStreamFormValues,
} from "@/app/(dashboard)/revenue/revenue-stream-form";
import { DraftCard } from "../draft-card";
import type { WizardStepHandle } from "../types";

interface RevenueStepProps {
  suggestions?: RevenueStreamFormValues[];
}

type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; index: number };

/**
 * Wizard step 2 — Revenue. Hosts the real (already-controlled) RevenueStreamForm.
 * AI revenue suggestions render as DraftCards; Add/Edit opens the form; saving
 * POSTs /api/revenue-streams immediately via apiFetch (the company already exists
 * by this step). Saved streams move from drafts into a "saved" list.
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 2).
 */
export const RevenueStep = forwardRef<WizardStepHandle, RevenueStepProps>(
  function RevenueStep({ suggestions = [] }, ref) {
  // Draft cards seeded from AI suggestions; an accepted draft is removed once saved.
  const [drafts, setDrafts] = useState<RevenueStreamFormValues[]>(suggestions);
  const [saved, setSaved] = useState<RevenueStreamFormValues[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  // RC2: implement auto-save-on-continue
  useImperativeHandle(ref, () => ({ submit: async () => true }));

  const handleSubmit = async (values: RevenueStreamFormValues) => {
    const res = await apiFetch("/api/revenue-streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(await extractApiError(res));
    // Success: mark the edited draft accepted (remove it) and append to saved.
    if (mode.kind === "edit") {
      const idx = mode.index;
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
    }
    setSaved((prev) => [...prev, values]);
    setMode({ kind: "list" });
  };

  if (mode.kind !== "list") {
    const initial =
      mode.kind === "edit" ? drafts[mode.index] : undefined;
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
          initial={initial}
          onSubmit={handleSubmit}
          onCancel={() => setMode({ kind: "list" })}
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

      {saved.length > 0 && (
        <div>
          {saved.map((s, i) => (
            <DraftCard key={`saved-${i}`} title={s.name} meta="Saved" />
          ))}
        </div>
      )}

      {drafts.length > 0 && (
        <div>
          {drafts.map((d, i) => (
            <DraftCard
              key={`draft-${i}`}
              title={d.name}
              ai
              onEdit={() => setMode({ kind: "edit", index: i })}
              onRemove={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setMode({ kind: "add" })}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-300 px-4 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:border-brand-400 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800"
      >
        <Plus className="h-4 w-4" />
        Add a revenue stream
      </button>
    </div>
  );
});
