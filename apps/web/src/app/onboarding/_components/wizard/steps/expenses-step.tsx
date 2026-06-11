"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import {
  ExpenseForm,
  type ExpenseRow,
  type ExpenseSubmitPayload,
} from "@/app/(dashboard)/expenses/expense-form";
import { DraftCard } from "../draft-card";

interface ExpensesStepProps {
  suggestions?: ExpenseRow[];
}

/** Minimal account shape used by ExpenseForm + the suggestion→account mapping. */
interface AccountRow {
  id: string;
  name: string;
  category: string;
}

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; index: number };

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
 * Wizard step 4 — Expenses. Hosts the REAL production `<ExpenseForm>` over the
 * company's default expense/COGS accounts (created at company creation in step 1).
 *
 * On mount it GETs `/api/accounts` and filters to `operating_expense`/`cogs`,
 * passing them as the form's required `accounts` list. AI expense suggestions
 * render as DraftCards, each pre-mapped to the closest default account by
 * category name; "Add an expense"/"Edit" opens the form; a successful save POSTs
 * `/api/forecast-lines` (the company already exists by this step) and moves the
 * draft into a saved list.
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 4).
 */
export function ExpensesStep({ suggestions = [] }: ExpensesStepProps) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<ExpenseRow[]>(suggestions);
  const [saved, setSaved] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

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

  const handleSubmit = async (payload: ExpenseSubmitPayload) => {
    const res = await apiFetch("/api/forecast-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiError(res));
    if (mode.kind === "edit") {
      const idx = mode.index;
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
    }
    setSaved((prev) => [...prev, payload.name?.trim() || "Expense"]);
    setMode({ kind: "list" });
  };

  // ---- Form view -----------------------------------------------------------
  if (mode.kind !== "list") {
    const draft = mode.kind === "edit" ? drafts[mode.index] : undefined;
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
          onSubmit={handleSubmit}
          onCancel={() => setMode({ kind: "list" })}
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

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2 text-xs text-danger-600"
        >
          {loadError}
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
          {saved.length > 0 && (
            <div>
              {saved.map((label, i) => (
                <DraftCard key={`saved-${i}`} title={label} meta="Saved" />
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <div>
              {drafts.map((d, i) => {
                const accountId = d.accountId || mapSuggestionToAccount(d, accounts);
                const accountName =
                  accounts.find((a) => a.id === accountId)?.name ?? undefined;
                return (
                  <DraftCard
                    key={`draft-${d.id ?? i}`}
                    title={d.name?.trim() || accountName || "Expense"}
                    meta={accountName}
                    ai
                    onEdit={() => setMode({ kind: "edit", index: i })}
                    onRemove={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
                  />
                );
              })}
            </div>
          )}

          {saved.length === 0 && drafts.length === 0 && (
            <p className="rounded-lg border border-dashed border-surface-300 px-4 py-6 text-center text-sm text-surface-500 dark:border-surface-700 dark:text-surface-400">
              No expenses yet. Add one to start your forecast.
            </p>
          )}

          <button
            type="button"
            onClick={() => setMode({ kind: "add" })}
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
}
