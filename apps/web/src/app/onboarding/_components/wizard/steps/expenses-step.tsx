"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import {
  ExpenseForm,
  type ExpenseRow,
  type ExpenseSubmitPayload,
} from "@/app/(dashboard)/expenses/expense-form";
import { DraftCard } from "../draft-card";
import type { WizardStepHandle } from "../types";
import { useDraftList } from "../use-draft-list";

interface ExpensesStepProps {
  suggestions?: ExpenseRow[];
}

/** Minimal account shape used by ExpenseForm + the suggestion→account mapping. */
interface AccountRow {
  id: string;
  name: string;
  category: string;
}

/**
 * Map an AI expense suggestion to the closest default account by category name.
 * Reuses the name-matching idea from `lib/onboarding-imports.ts` (now dead code):
 * suggestions name a category (e.g. "Cloud Infrastructure") that matches a default
 * account name. Falls back to the first account so the form always opens valid.
 */
function mapSuggestionToAccount(
  suggestion: ExpenseRow,
  accounts: AccountRow[],
): string {
  if (accounts.length === 0) return "";
  const wanted = (suggestion.subcategory ?? suggestion.name ?? "").trim().toLowerCase();
  if (wanted !== "") {
    const match = accounts.find((a) => a.name.trim().toLowerCase() === wanted);
    if (match) return match.id;
  }
  return accounts[0]!.id;
}

/**
 * The real ExpenseForm emits a normalized payload (Dates, trimmed subcategory).
 * Map it back to the stored `ExpenseRow` shape so a freshly-saved row can be
 * re-opened in the form for a follow-up edit (#5). POST/PATCH accept either shape
 * — `createForecastLineSchema` re-parses string|Date dates at the boundary.
 */
function payloadToRow(p: ExpenseSubmitPayload): ExpenseRow {
  return {
    id: p.id ?? "",
    accountId: p.accountId ?? "",
    method: p.method,
    parameters: p.parameters,
    startDate: p.startDate,
    endDate: p.endDate,
    vendor: p.vendor ?? null,
    notes: p.notes ?? null,
    name: p.name ?? null,
    subcategory: p.subcategory,
    frequency: p.frequency ?? null,
    isOneTime: p.isOneTime ?? null,
    isRecurring: p.isRecurring ?? null,
    departmentId: p.departmentId ?? null,
  };
}

/**
 * Wizard step 4 — Expenses. Hosts the REAL production `<ExpenseForm>` over the
 * company's default expense/COGS accounts (created at company creation in step 1).
 *
 * On mount it GETs `/api/accounts` and filters to `operating_expense`/`cogs`,
 * passing them as the form's required `accounts` list. AI expense suggestions
 * render as DraftCards, each pre-mapped to the closest default account by
 * category name.
 *
 * #7 auto-save-on-Continue: `submit()` flushes every un-saved draft → POST
 * `/api/forecast-lines`. #5: saved rows expose Edit (re-open form → PATCH
 * `/api/forecast-lines/{id}`).
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 4).
 */
export const ExpensesStep = forwardRef<WizardStepHandle, ExpensesStepProps>(
  function ExpensesStep({ suggestions = [] }, ref) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const api = useDraftList<ExpenseRow, ExpenseSubmitPayload>({
    suggestions,
    create: async (values) => {
      const res = await apiFetch("/api/forecast-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      const body = (await res.json()) as { id: string };
      return body.id;
    },
    update: async (id, values) => {
      const res = await apiFetch(`/api/forecast-lines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
    },
    toStored: payloadToRow,
  });

  // #7: Continue auto-saves every un-saved draft (POST each) before advancing.
  useImperativeHandle(ref, () => ({ submit: api.flush }), [api.flush]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/accounts");
        if (!res.ok) throw new Error(await extractApiError(res));
        const rows = (await res.json()) as AccountRow[];
        if (cancelled) return;
        const expenseAccounts = rows.filter(
          (a) => a.category === "operating_expense" || a.category === "cogs",
        );
        setAccounts(expenseAccounts);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load accounts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ExpenseForm wants `{ id; name }` accounts.
  const formAccounts = useMemo(
    () => accounts.map((a) => ({ id: a.id, name: a.name })),
    [accounts],
  );

  // ---- Form view -----------------------------------------------------------
  const mode = api.mode;
  if (mode.kind !== "list") {
    const editing =
      mode.kind === "edit"
        ? api.items.find((it) => it.key === mode.key)
        : undefined;
    const draft = editing?.values;
    const initialValue: ExpenseRow | undefined = draft
      ? { ...draft, accountId: draft.accountId || mapSuggestionToAccount(draft, accounts) }
      : undefined;
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            {mode.kind === "edit" ? "Edit expense" : "Add an expense"}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Model a recurring or one-time cost. We&apos;ll save it to your workspace.
          </p>
        </div>
        <ExpenseForm
          mode={mode.kind === "edit" ? "edit" : "add"}
          initialValue={initialValue}
          accounts={formAccounts}
          departments={[]}
          forecastLines={[]}
          onSubmit={api.save}
          onCancel={api.cancel}
        />
      </div>
    );
  }

  // ---- Step view -----------------------------------------------------------
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
          Expenses
        </h2>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          Add your recurring costs. We mapped each suggestion to one of your
          default expense accounts — edit to adjust.
        </p>
      </div>

      {(loadError || api.error) && (
        <div
          role="alert"
          className="rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2 text-xs text-danger-600"
        >
          {loadError ?? api.error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg border border-surface-200 bg-surface-100 dark:border-surface-800 dark:bg-surface-800"
            />
          ))}
        </div>
      ) : (
        <>
          {api.items.length > 0 && (
            <div>
              {api.items.map((item) => {
                const accountId =
                  item.values.accountId || mapSuggestionToAccount(item.values, accounts);
                const accountName =
                  accounts.find((a) => a.id === accountId)?.name ?? undefined;
                const title = item.values.name?.trim() || accountName || "Expense";
                return item.saved ? (
                  <DraftCard
                    key={item.key}
                    title={title}
                    meta="Saved"
                    onEdit={() => api.openEdit(item.key)}
                  />
                ) : (
                  <DraftCard
                    key={item.key}
                    title={title}
                    meta={accountName}
                    ai
                    onEdit={() => api.openEdit(item.key)}
                    onRemove={() => api.removeDraft(item.key)}
                  />
                );
              })}
            </div>
          )}

          {api.items.length === 0 && (
            <p className="rounded-lg border border-dashed border-surface-300 px-4 py-6 text-center text-sm text-surface-500 dark:border-surface-700 dark:text-surface-400">
              No expenses yet. Add one to start your forecast.
            </p>
          )}

          <button
            type="button"
            onClick={api.openAdd}
            disabled={formAccounts.length === 0}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-300 px-4 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:border-brand-400 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-surface-700 dark:hover:bg-surface-800"
          >
            <Plus className="h-4 w-4" />
            Add an expense
          </button>
        </>
      )}
    </div>
  );
});
