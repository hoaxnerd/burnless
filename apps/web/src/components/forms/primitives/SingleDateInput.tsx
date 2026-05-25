"use client";

import type { ChangeEvent } from "react";

export interface SingleDateInputProps {
  label: string;
  value: string; // ISO YYYY-MM-DD; empty string for unset
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  min?: string; // ISO YYYY-MM-DD
  max?: string; // ISO YYYY-MM-DD
}

/**
 * Single ISO-YYYY-MM-DD date input matching the primitives kit conventions
 * (label, required, disabled, hint). Use for any single-field date — close
 * date, effective date, milestone due date, vesting date, etc. For ranges,
 * use <DateRangePicker> instead.
 *
 * Phase 4 D §1.7 promotion: promoted with ≥2 use sites (funding round-fields,
 * team child-row UIs).
 */
export function SingleDateInput({
  label,
  value,
  onChange,
  required,
  disabled,
  hint,
  min,
  max,
}: SingleDateInputProps) {
  return (
    <label className="block text-sm">
      <span className="text-surface-700 dark:text-surface-300">
        {label}
        {required && <span className="text-danger-500"> *</span>}
      </span>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className="mt-1 block w-full rounded-md border border-surface-300 dark:bg-surface-800 px-2 py-1"
      />
      {hint && <p className="mt-1 text-xs text-surface-500">{hint}</p>}
    </label>
  );
}
