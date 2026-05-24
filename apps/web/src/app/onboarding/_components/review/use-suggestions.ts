/**
 * `useSuggestionList<T>` — local-state list that seeds itself once from the
 * AI-streamed prop (`initial`) and never re-overwrites once seeded. The five
 * suggestion sections (founders, funding, headcount, expenses, revenue) all
 * follow this exact pattern, so it's worth a helper.
 *
 * Each seeded item gets a synthetic `id` (so React keys are stable across
 * field edits) and `selected: true` so users opt out, not in.
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface Selectable {
  id?: string;
  selected?: boolean;
}

interface Options<T> {
  initial: T[] | undefined;
  /** Prefix for the synthetic id (e.g. "funding" → "funding-0"). */
  idPrefix: string;
}

export interface SuggestionListApi<T extends Selectable> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  updateField: <K extends keyof T>(id: T["id"], field: K, value: T[K]) => void;
  /** Returns the selected items with id/selected stripped — ready to POST. */
  selectedPayload: () => Array<Omit<T, "id" | "selected">>;
}

export function useSuggestionList<T extends Selectable>({
  initial,
  idPrefix,
}: Options<T>): SuggestionListApi<T> {
  const [items, setItems] = useState<T[]>([]);
  const seeded = useRef(false);

  // Seed-once from the streamed prop. setState inside useEffect is the standard
  // pattern for "initialize from async-arriving data", and the `seeded` guard
  // ensures it fires exactly once.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (seeded.current) return;
    if (!initial || initial.length === 0) return;
    setItems(
      initial.map((entry, i) => ({
        ...entry,
        id: `${idPrefix}-${i}`,
        selected: true,
      })),
    );
    seeded.current = true;
  }, [initial, idPrefix]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateField = useCallback(<K extends keyof T>(id: T["id"], field: K, value: T[K]) => {
    if (!id) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }, []);

  const selectedPayload = useCallback((): Array<Omit<T, "id" | "selected">> => {
    return items
      .filter((item) => item.selected)
      .map((item) => {
        // Strip synthetic fields. Casting through `Record` keeps the helper
        // generic over T without needing parameter destructuring (which would
        // trip TS6133 on unused `_id`/`_selected` bindings).
        const stripped = { ...(item as unknown as Record<string, unknown>) };
        delete stripped.id;
        delete stripped.selected;
        return stripped as Omit<T, "id" | "selected">;
      });
  }, [items]);

  return { items, setItems, updateField, selectedPayload };
}
