"use client";

/**
 * FrequencySelector — segmented control for billing frequency.
 *
 * Phase 1 §1.7. Local primitive used by `<ExpenseForm>`. Style matches the
 * sibling segmented control in `expenses-view.tsx` (the overview/budget toggle)
 * and `dashboard/mode-switcher.tsx`.
 *
 * Controlled-only (no internal state).
 */

import type { KeyboardEvent } from "react";

export type Frequency = "monthly" | "quarterly" | "annual";

interface FrequencySelectorProps {
  value: Frequency;
  onChange: (v: Frequency) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

const OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

export function FrequencySelector({
  value,
  onChange,
  disabled = false,
  id,
  "aria-label": ariaLabel = "Frequency",
}: FrequencySelectorProps) {
  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = OPTIONS.findIndex((o) => o.value === value);
    if (idx < 0) return;
    const nextIdx =
      e.key === "ArrowRight"
        ? (idx + 1) % OPTIONS.length
        : (idx - 1 + OPTIONS.length) % OPTIONS.length;
    const next = OPTIONS[nextIdx];
    if (next) onChange(next.value);
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKey}
      className="inline-flex items-center gap-1 rounded-lg bg-surface-100 p-1 border border-surface-200"
    >
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              isActive
                ? "bg-surface-0 text-surface-900 shadow-sm"
                : "text-surface-500 hover:text-surface-700"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
