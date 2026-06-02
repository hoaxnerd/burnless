"use client";

import { Check, Circle } from "lucide-react";

export interface GenChecklistItem {
  text: string;
  checked?: boolean;
}

export interface GenChecklistProps {
  title?: string | null;
  items: GenChecklistItem[];
}

/**
 * Presentational checklist. Every item is model-authored — this renderer does no
 * formatting and shows no financial data on its own. Done items get a filled
 * check + strikethrough; pending items get an empty circle.
 */
export function GenChecklist({ title, items }: GenChecklistProps) {
  if (!items || items.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No checklist items.
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-surface-200">
      {title ? (
        <div className="border-b border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-700">
          {title}
        </div>
      ) : null}
      <ul className="divide-y divide-surface-100">
        {items.map((item, i) => {
          const checked = item.checked === true;
          return (
            <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
              {checked ? (
                <Check
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
                />
              ) : (
                <Circle
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-surface-300"
                />
              )}
              <span
                className={
                  checked
                    ? "text-surface-400 line-through"
                    : "text-surface-700"
                }
              >
                {item.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
