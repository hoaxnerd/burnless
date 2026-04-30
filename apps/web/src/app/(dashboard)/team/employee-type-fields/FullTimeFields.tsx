"use client";

import type { HeadcountFormState } from "@/lib/headcount-params";

interface Props {
  state: HeadcountFormState;
  errors: Record<string, string>;
  onChange: (partial: Partial<HeadcountFormState>) => void;
}

/**
 * Full-time-specific fields: annual salary + count (FTE).
 * Monthly cost preview is salary/12 × count (benefits applied at payload level
 * via benefitsRate/benefitsBreakdown, not previewed here to keep it simple).
 */
export function FullTimeFields({ state, errors, onChange }: Props) {
  const monthlyCost = (state.salary || 0) * (state.count || 0) / 12;

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="full-time-fields">
      <label className="block text-sm">
        <span className="block font-medium text-surface-700 mb-1">Annual salary</span>
        <input
          type="number"
          min={0}
          step={1}
          value={state.salary}
          onChange={(e) => onChange({ salary: Number(e.target.value) })}
          aria-invalid={!!errors.salary}
          className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {errors.salary && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.salary}
          </span>
        )}
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-surface-700 mb-1">Count (FTE)</span>
        <input
          type="number"
          step={0.5}
          min={0.01}
          max={99.99}
          value={state.count}
          onChange={(e) => onChange({ count: Number(e.target.value) })}
          aria-invalid={!!errors.count}
          className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {errors.count && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.count}
          </span>
        )}
      </label>
      <div className="col-span-2 rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-xs text-surface-500">
        Monthly cost ~ {monthlyCost.toFixed(0)} (excl. benefits)
      </div>
    </div>
  );
}
