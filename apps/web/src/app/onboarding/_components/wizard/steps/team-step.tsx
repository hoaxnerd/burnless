"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import { HeadcountFormBody } from "@/app/(dashboard)/team/headcount-form-body";
import type { EditableHeadcount } from "@/app/(dashboard)/team/headcount-form";
import type { BenefitsBreakdown } from "@/lib/headcount-params";
import { normalizeHeadcountPayload } from "@/lib/headcount-params";
import { DraftCard } from "../draft-card";
import type { WizardStepHandle } from "../types";

type HeadcountPayload = ReturnType<typeof normalizeHeadcountPayload>;

interface TeamStepProps {
  suggestions?: EditableHeadcount[];
  departments: { id: string; name: string }[];
  companyBenefitsRates?: BenefitsBreakdown;
}

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; index: number };

/**
 * Wizard step 5 — Team. Hosts the real (Phase A) controlled HeadcountFormBody,
 * populated with the company's default departments (threaded from the page after
 * company creation). AI headcount-role suggestions render as DraftCards; Add/Edit
 * opens the form; saving POSTs /api/headcount immediately via apiFetch (the
 * company already exists by this step). Saved hires move from drafts into a
 * "saved" list.
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 5).
 */
export const TeamStep = forwardRef<WizardStepHandle, TeamStepProps>(
  function TeamStep({ suggestions = [], departments, companyBenefitsRates }, ref) {
  // Draft cards seeded from AI suggestions; an accepted draft is removed once saved.
  const [drafts, setDrafts] = useState<EditableHeadcount[]>(suggestions);
  const [saved, setSaved] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  // RC2: implement auto-save-on-continue
  useImperativeHandle(ref, () => ({ submit: async () => true }));

  const handleSubmit = async (payload: HeadcountPayload) => {
    const res = await apiFetch("/api/headcount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiError(res));
    // Success: mark the edited draft accepted (remove it) and record the saved title.
    if (mode.kind === "edit") {
      const idx = mode.index;
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
    }
    setSaved((prev) => [...prev, String(payload.title ?? "Hire")]);
    setMode({ kind: "list" });
  };

  if (mode.kind !== "list") {
    const initial = mode.kind === "edit" ? drafts[mode.index] : undefined;
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
          initial={initial}
          submitLabel="Save hire"
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
          Team
        </h2>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          Add the people you&apos;re planning to hire. Edit a suggestion or start fresh.
        </p>
      </div>

      {saved.length > 0 && (
        <div>
          {saved.map((title, i) => (
            <DraftCard key={`saved-${i}`} title={title} meta="Saved" />
          ))}
        </div>
      )}

      {drafts.length > 0 && (
        <div>
          {drafts.map((d, i) => (
            <DraftCard
              key={`draft-${i}`}
              title={d.title}
              meta={departments.find((dep) => dep.id === d.departmentId)?.name}
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
        Add a hire
      </button>
    </div>
  );
});
