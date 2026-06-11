"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import {
  FundingRoundForm,
  type FundingRoundFormValues,
  type FundingRoundSubmitPayload,
} from "@/app/(dashboard)/funding/funding-round-form";
import {
  ShareClassFormFields,
  type ShareClassValues,
} from "@/app/(dashboard)/funding/cap-table/share-class-form-fields";
import {
  OptionPoolFormFields,
  type OptionPoolValues,
} from "@/app/(dashboard)/funding/cap-table/option-pool-form-fields";
import { DraftCard } from "../draft-card";

interface FundingStepProps {
  suggestions?: FundingRoundSubmitPayload[];
}

type RoundMode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; index: number };

/**
 * Wizard step 3 — Funding & cap table. Two zones, both reusing the REAL
 * production forms (made controlled in Phase A):
 *   - Zone 1 "Funding rounds": FundingRoundForm → POST /api/funding-rounds.
 *   - Zone 2 "Cap table": ShareClassFormFields → POST /api/share-classes, and a
 *     SINGLE OptionPoolFormFields → POST /api/option-pools. The "Add option pool"
 *     affordance hides once a pool exists (mirrors the single-pool guard in
 *     cap-table-manager.tsx — equityGrants has no optionPoolId column).
 *
 * Cap-table writes are blocked while a scenario is active (the route owns the
 * 409); onboarding runs on the base scenario, but if a write returns 409 we
 * surface the route's message inline rather than crashing.
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 3).
 */
export function FundingStep({ suggestions = [] }: FundingStepProps) {
  // Zone 1 — funding rounds.
  const [drafts, setDrafts] = useState<FundingRoundSubmitPayload[]>(suggestions);
  const [savedRounds, setSavedRounds] = useState<FundingRoundSubmitPayload[]>([]);
  const [roundMode, setRoundMode] = useState<RoundMode>({ kind: "list" });

  // Zone 2 — cap table.
  const [shareClasses, setShareClasses] = useState<ShareClassValues[]>([]);
  const [pool, setPool] = useState<OptionPoolValues | null>(null);
  const [addingShareClass, setAddingShareClass] = useState(false);
  const [addingPool, setAddingPool] = useState(false);
  const [capTableError, setCapTableError] = useState<string | null>(null);

  const hasPool = pool !== null;

  // ---- Zone 1 handlers -----------------------------------------------------
  const handleRoundSubmit = async (payload: FundingRoundSubmitPayload) => {
    const res = await apiFetch("/api/funding-rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiError(res));
    if (roundMode.kind === "edit") {
      const idx = roundMode.index;
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
    }
    setSavedRounds((prev) => [...prev, payload]);
    setRoundMode({ kind: "list" });
  };

  // ---- Zone 2 handlers -----------------------------------------------------
  // Cap-table writes own the 409 (active-scenario lock). Surface the route's
  // message inline; do not let it bubble (the form already swallows via onSubmit
  // catch, so we additionally guard here and keep the panel alive).
  const handleShareClassSubmit = async (values: ShareClassValues) => {
    setCapTableError(null);
    const res = await apiFetch("/api/share-classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const message = await extractApiError(res);
      setCapTableError(message);
      throw new Error(message);
    }
    setShareClasses((prev) => [...prev, values]);
    setAddingShareClass(false);
  };

  const handlePoolSubmit = async (values: OptionPoolValues) => {
    setCapTableError(null);
    const res = await apiFetch("/api/option-pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const message = await extractApiError(res);
      setCapTableError(message);
      throw new Error(message);
    }
    setPool(values);
    setAddingPool(false);
  };

  // ---- Zone 1 form view ----------------------------------------------------
  if (roundMode.kind !== "list") {
    const draft = roundMode.kind === "edit" ? drafts[roundMode.index] : undefined;
    const initial: Partial<FundingRoundFormValues> | undefined = draft
      ? {
          name: draft.name,
          roundType: draft.roundType,
          amount: draft.amount,
          date: draft.date,
          closeDate: draft.closeDate,
          notes: draft.notes,
          parameters: draft.parameters,
          isProjected: draft.isProjected,
        }
      : undefined;
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            {roundMode.kind === "edit" ? "Edit funding round" : "Add a funding round"}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Capture what you&apos;ve raised. We&apos;ll save it to your workspace.
          </p>
        </div>
        <FundingRoundForm
          mode={roundMode.kind === "edit" ? "edit" : "add"}
          initial={initial}
          onSubmit={handleRoundSubmit}
          onClose={() => setRoundMode({ kind: "list" })}
        />
      </div>
    );
  }

  // ---- Step view -----------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
          Funding &amp; cap table
        </h2>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          Add rounds you&apos;ve raised, then set up your share classes. We
          pre-filled what we found.
        </p>
      </div>

      {/* ZONE 1 — funding rounds */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100">
          Funding rounds
        </h3>

        {savedRounds.length > 0 && (
          <div>
            {savedRounds.map((r, i) => (
              <DraftCard key={`saved-round-${i}`} title={r.name} meta="Saved" />
            ))}
          </div>
        )}

        {drafts.length > 0 && (
          <div>
            {drafts.map((d, i) => (
              <DraftCard
                key={`draft-round-${i}`}
                title={d.name}
                ai
                onEdit={() => setRoundMode({ kind: "edit", index: i })}
                onRemove={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setRoundMode({ kind: "add" })}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-300 px-4 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:border-brand-400 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800"
        >
          <Plus className="h-4 w-4" />
          Add a funding round
        </button>
      </section>

      <div className="h-px bg-surface-200 dark:bg-surface-800" />

      {/* ZONE 2 — cap table */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100">
          Cap table
        </h3>

        {shareClasses.length > 0 && (
          <div>
            {shareClasses.map((sc, i) => (
              <DraftCard
                key={`share-class-${i}`}
                title={sc.name}
                meta={`${sc.totalIssued.toLocaleString()} shares · ${sc.classType}`}
              />
            ))}
          </div>
        )}

        {pool && (
          <DraftCard
            title={pool.name}
            meta={`${pool.totalReserved.toLocaleString()} reserved`}
          />
        )}

        {addingShareClass && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
            <ShareClassFormFields
              onSubmit={handleShareClassSubmit}
              onCancel={() => setAddingShareClass(false)}
            />
          </div>
        )}

        {addingPool && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
            <OptionPoolFormFields
              onSubmit={handlePoolSubmit}
              onCancel={() => setAddingPool(false)}
            />
          </div>
        )}

        {capTableError && (
          <div
            role="alert"
            className="rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2 text-xs text-danger-600"
          >
            {capTableError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!addingShareClass && (
            <button
              type="button"
              onClick={() => {
                setCapTableError(null);
                setAddingShareClass(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-100 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/30"
            >
              <Plus className="h-4 w-4" />
              Add share class
            </button>
          )}
          {!hasPool && !addingPool && (
            <button
              type="button"
              onClick={() => {
                setCapTableError(null);
                setAddingPool(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-100 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/30"
            >
              <Plus className="h-4 w-4" />
              Add option pool
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
