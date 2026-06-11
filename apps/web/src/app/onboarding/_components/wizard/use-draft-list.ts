"use client";

import { useCallback, useRef, useState } from "react";

/**
 * use-draft-list — the shared draft-list engine behind every domain wizard step
 * (revenue, funding, expenses, team).
 *
 * S4b RC2 (#5/#7). Each step owns a primary list whose items are either AI
 * suggestions (unsaved drafts, no id) or user-added rows (saved immediately).
 * This hook holds that list and the add/edit mode, and exposes the two persist
 * paths the founder asked for:
 *
 *   - #7 auto-save-on-Continue: `flush()` POSTs every still-unsaved item to the
 *     create endpoint before the wizard advances. Continue calls this via the
 *     step's `WizardStepHandle.submit`.
 *   - #5 editable saved rows: `openEdit(key)` re-opens the real form prefilled;
 *     on submit, `save()` PATCHes a saved item (update) or POSTs an unsaved one
 *     (create) — so a "Saved" row can be edited again.
 *
 * Type params:
 *   T — the stored/display/initial shape (the suggestion shape, also what
 *       `create`/`update` consume). `flush()` POSTs these directly.
 *   S — what the REAL form emits from its `onSubmit` (often a normalized payload
 *       distinct from T, e.g. expenses/team). `save(values: S)` persists it; the
 *       step's `toStored(s)` maps it back to T so the saved row can be re-edited.
 *       For steps where S === T (revenue/funding), `toStored` defaults to
 *       identity.
 *
 * Keys are stable and allocated from a ref counter — never Math.random/Date.now
 * (banned here) — so list mutations don't reshuffle React keys.
 */

export interface DraftItem<T> {
  key: string;
  values: T;
  saved: boolean;
  id?: string;
}

export interface DraftListApi<T, S = T> {
  items: DraftItem<T>[];
  mode: { kind: "list" } | { kind: "add" } | { kind: "edit"; key: string };
  error: string | null;
  openAdd(): void;
  openEdit(key: string): void;
  cancel(): void;
  /** Drop an unsaved draft (no DELETE call). No-op for saved items. */
  removeDraft(key: string): void;
  /** Called by the real form's onSubmit for the current add/edit. */
  save(values: S): Promise<void>;
  /** Flush all unsaved items; returns true if all persisted. */
  flush(): Promise<boolean>;
}

export function useDraftList<T, S = T>(opts: {
  suggestions: T[];
  /** POST → returns the new id (read from the created row's `id`). */
  create: (values: T) => Promise<string>;
  /** PATCH an already-saved item. */
  update: (id: string, values: T) => Promise<void>;
  /**
   * Map the form's emitted submit value (S) back to the stored/display shape
   * (T). Omit when S === T (identity). Used so a freshly-saved row can be
   * re-opened in the form for a follow-up edit.
   */
  toStored?: (submitted: S) => T;
}): DraftListApi<T, S> {
  const { create, update } = opts;
  const toStored = opts.toStored ?? ((s: S) => s as unknown as T);

  // Monotonic key counter — stable React keys without Math.random/Date.now.
  const keyCounter = useRef(0);
  const nextKey = useCallback(() => `draft-${keyCounter.current++}`, []);

  // Seed once from suggestions (all unsaved). Lazy init so re-renders don't
  // re-seed; the suggestions prop is fixed for the life of the step.
  const [items, setItems] = useState<DraftItem<T>[]>(() =>
    opts.suggestions.map((values) => ({ key: nextKey(), values, saved: false })),
  );
  const [mode, setMode] = useState<DraftListApi<T, S>["mode"]>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setError(null);
    setMode({ kind: "add" });
  }, []);

  const openEdit = useCallback((key: string) => {
    setError(null);
    setMode({ kind: "edit", key });
  }, []);

  const cancel = useCallback(() => {
    setMode({ kind: "list" });
  }, []);

  const removeDraft = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => !(it.key === key && !it.saved)));
  }, []);

  const save = useCallback(
    async (submitted: S) => {
      setError(null);
      const values = toStored(submitted);
      try {
        if (mode.kind === "edit") {
          const target = items.find((it) => it.key === mode.key);
          if (target?.saved && target.id) {
            // Saved → PATCH, replace stored values.
            await update(target.id, values);
            setItems((prev) =>
              prev.map((it) => (it.key === target.key ? { ...it, values } : it)),
            );
          } else if (target) {
            // Unsaved draft edited → POST (create), mark saved + id.
            const id = await create(values);
            setItems((prev) =>
              prev.map((it) =>
                it.key === target.key ? { ...it, values, saved: true, id } : it,
              ),
            );
          }
        } else {
          // Add → POST, append saved item.
          const id = await create(values);
          setItems((prev) => [
            ...prev,
            { key: nextKey(), values, saved: true, id },
          ]);
        }
        setMode({ kind: "list" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save";
        setError(message);
        // Rethrow so the real form surfaces the error inline too.
        throw err;
      }
    },
    [mode, items, create, update, toStored, nextKey],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    setError(null);
    // Snapshot the unsaved items; POST sequentially, marking each saved on
    // success. Stop and report on the first failure (do NOT advance).
    const unsaved = items.filter((it) => !it.saved);
    for (const it of unsaved) {
      try {
        const id = await create(it.values);
        setItems((prev) =>
          prev.map((x) => (x.key === it.key ? { ...x, saved: true, id } : x)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save";
        setError(message);
        return false;
      }
    }
    return true;
  }, [items, create]);

  return {
    items,
    mode,
    error,
    openAdd,
    openEdit,
    cancel,
    removeDraft,
    save,
    flush,
  };
}
