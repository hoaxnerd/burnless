"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
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
import type { WizardStepHandle } from "../types";
import { useDraftList } from "../use-draft-list";

interface FundingStepProps {
  suggestions?: FundingRoundSubmitPayload[];
}

/** A persisted share class (POST returned an id) so it can be re-edited (#5). */
interface SavedShareClass {
  id: string;
  values: ShareClassValues;
}

/**
 * Wizard step 3 — Funding & cap table. Two zones, both reusing the REAL
 * production forms (made controlled in Phase A):
 *   - Zone 1 "Funding rounds": FundingRoundForm → POST /api/funding-rounds. AI
 *     drafts auto-save on Continue via `useDraftList.flush()` (#7); saved rounds
 *     expose Edit → PATCH /api/funding-rounds/{id} (#5).
 *   - Zone 2 "Cap table": ShareClassFormFields → POST /api/share-classes, and a
 *     SINGLE OptionPoolFormFields → POST /api/option-pools. The "Add option pool"
 *     affordance hides once a pool exists (mirrors the single-pool guard in
 *     cap-table-manager.tsx — equityGrants has no optionPoolId column). Cap-table
 *     has NO AI drafts, so it keeps its add-immediately behavior; `flush()` only
 *     covers funding ROUNDS. Saved share-class rows are editable (#5) → PATCH
 *     /api/share-classes/{id}.
 *
 * Cap-table writes are blocked while a scenario is active (the route owns the
 * 409); onboarding runs on the base scenario, but if a write returns 409 we
 * surface the route's message inline rather than crashing.
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 3).
 */
export const FundingStep = forwardRef<WizardStepHandle, FundingStepProps>(
  function FundingStep({ suggestions = [] }, ref) {
  // Zone 1 — funding rounds (AI drafts + auto-save-on-Continue).
  const api = useDraftList<FundingRoundSubmitPayload>({
    suggestions,
    create: async (values) => {
      const res = await apiFetch("/api/funding-rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      const body = (await res.json()) as { id: string };
      return body.id;
    },
    update: async (id, values) => {
      const res = await apiFetch(`/api/funding-rounds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
    },
  });

  // #7: Continue auto-saves every un-saved funding-round draft before advancing.
  useImperativeHandle(ref, () => ({ submit: api.flush }), [api.flush]);

  // Zone 2 — cap table (no AI drafts; add-immediately, ids tracked for edit).
  const [shareClasses, setShareClasses] = useState<SavedShareClass[]>([]);
  const [pool, setPool] = useState<OptionPoolValues | null>(null);
  const [addingShareClass, setAddingShareClass] = useState(false);
  const [editingShareClassId, setEditingShareClassId] = useState<string | null>(null);
  const [addingPool, setAddingPool] = useState(false);
  const [capTableError, setCapTableError] = useState<string | null>(null);

  const hasPool = pool !== null;

  // ---- Zone 2 handlers -----------------------------------------------------
  // Cap-table writes own the 409 (active-scenario lock). Surface the route's
  // message inline; rethrow so the real form shows it too.
  const handleShareClassSubmit = async (values: ShareClassValues) => {
    setCapTableError(null);
    if (editingShareClassId) {
      const res = await apiFetch(`/api/share-classes/${editingShareClassId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const message = await extractApiError(res);
        setCapTableError(message);
        throw new Error(message);
      }
      const id = editingShareClassId;
      setShareClasses((prev) =>
        prev.map((sc) => (sc.id === id ? { id, values } : sc)),
      );
      setEditingShareClassId(null);
      return;
    }
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
    const body = (await res.json()) as { id: string };
    setShareClasses((prev) => [...prev, { id: body.id, values }]);
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
  const mode = api.mode;
  if (mode.kind !== "list") {
    const editing =
      mode.kind === "edit"
        ? api.items.find((it) => it.key === mode.key)
        : undefined;
    const draft = editing?.values;
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
            {mode.kind === "edit" ? "Edit funding round" : "Add a funding round"}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Capture what you&apos;ve raised. We&apos;ll save it to your workspace.
          </p>
        </div>
        <FundingRoundForm
          mode={mode.kind === "edit" ? "edit" : "add"}
          initial={initial}
          onSubmit={api.save}
          onClose={api.cancel}
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
            {shareClasses.map((sc) => (
              <DraftCard
                key={sc.id}
                title={sc.values.name}
                meta={`${sc.values.totalIssued.toLocaleString()} shares · ${sc.values.classType}`}
                onEdit={() => {
                  setCapTableError(null);
                  setAddingShareClass(false);
                  setEditingShareClassId(sc.id);
                }}
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

        {(addingShareClass || editingShareClassId) && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
            <ShareClassFormFields
              initial={
                editingShareClassId
                  ? shareClasses.find((sc) => sc.id === editingShareClassId)?.values
                  : undefined
              }
              onSubmit={handleShareClassSubmit}
              onCancel={() => {
                setAddingShareClass(false);
                setEditingShareClassId(null);
              }}
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
          {!addingShareClass && !editingShareClassId && (
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
});
