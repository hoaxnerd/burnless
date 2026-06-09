"use client";

import { useId, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional accessible name when `label` is not plain text. */
  ariaLabel?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the whole group (e.g. "Write mode"). */
  label: string;
  /** Hide the group label visually but keep it for screen readers. Default true. */
  visuallyHiddenLabel?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
};

/**
 * Mode/permission toggle implemented as an ARIA radiogroup. Selection is
 * conveyed by more than color (A11Y-CTRL-04): the selected segment gets a
 * raised surface, a ring, and a font-weight bump, plus `aria-checked`.
 *
 * Keyboard: arrow keys move selection within the group (native radio
 * semantics emulated), Home/End jump to ends.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  visuallyHiddenLabel = true,
  size = "md",
  disabled = false,
  className = "",
}: SegmentedControlProps<T>) {
  const groupId = useId();

  const enabledOptions = options.filter((o) => !o.disabled && !disabled);

  function moveSelection(direction: 1 | -1 | "first" | "last") {
    if (enabledOptions.length === 0) return;
    let next: SegmentedOption<T>;
    if (direction === "first") {
      next = enabledOptions[0]!;
    } else if (direction === "last") {
      next = enabledOptions[enabledOptions.length - 1]!;
    } else {
      const currentIdx = enabledOptions.findIndex((o) => o.value === value);
      const base = currentIdx === -1 ? 0 : currentIdx;
      const nextIdx = (base + direction + enabledOptions.length) % enabledOptions.length;
      next = enabledOptions[nextIdx]!;
    }
    if (next.value !== value) onChange(next.value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        moveSelection(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        moveSelection(-1);
        break;
      case "Home":
        e.preventDefault();
        moveSelection("first");
        break;
      case "End":
        e.preventDefault();
        moveSelection("last");
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={visuallyHiddenLabel ? undefined : `${groupId}-label`}
      onKeyDown={handleKeyDown}
      className={`inline-flex items-center gap-1 rounded-xl bg-surface-100 p-1 dark:bg-surface-800 ${className}`.trim()}
    >
      {!visuallyHiddenLabel && (
        <span id={`${groupId}-label`} className="sr-only">
          {label}
        </span>
      )}
      {options.map((opt) => {
        const checked = opt.value === value;
        const isDisabled = disabled || opt.disabled;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={opt.ariaLabel}
            disabled={isDisabled}
            // Roving tabindex: only the selected radio is in the tab order.
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!isDisabled && !checked) onChange(opt.value);
            }}
            className={`
              ${sizeStyles[size]}
              rounded-lg font-medium transition-all duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40
              disabled:opacity-60 disabled:cursor-not-allowed
              ${
                checked
                  ? "bg-surface-0 text-surface-900 font-semibold shadow-sm ring-1 ring-surface-300 dark:bg-surface-950 dark:text-surface-50 dark:ring-surface-600"
                  : "text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
              }
            `.trim()}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
