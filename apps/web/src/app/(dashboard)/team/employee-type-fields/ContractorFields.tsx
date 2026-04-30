"use client";

import type { HeadcountFormState } from "@/lib/headcount-params";

interface Props {
  state: HeadcountFormState;
  errors: Record<string, string>;
  onChange: (partial: Partial<HeadcountFormState>) => void;
}

/**
 * Contractor-specific fields: hourly rate + hoursPerWeek + count (no salary).
 * Monthly cost preview = hourlyRate × hoursPerWeek × 4.33 × count
 * (4.33 ~= avg weeks/month).
 */
const WEEKS_PER_MONTH = 4.33;

export function ContractorFields({ state, errors, onChange }: Props) {
  const monthlyCost =
    (state.hourlyRate ?? 0) * (state.hoursPerWeek ?? 0) * WEEKS_PER_MONTH * (state.count || 0);

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="contractor-fields">
      <label className="block text-sm">
        <span className="block font-medium text-surface-700 mb-1">Hourly rate</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={state.hourlyRate ?? ""}
          onChange={(e) =>
            onChange({ hourlyRate: e.target.value === "" ? null : Number(e.target.value) })
          }
          aria-invalid={!!errors.hourlyRate}
          className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {errors.hourlyRate && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.hourlyRate}
          </span>
        )}
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-surface-700 mb-1">Hours per week</span>
        <input
          type="number"
          min={0}
          max={168}
          step={0.5}
          value={state.hoursPerWeek ?? ""}
          onChange={(e) =>
            onChange({ hoursPerWeek: e.target.value === "" ? null : Number(e.target.value) })
          }
          aria-invalid={!!errors.hoursPerWeek}
          className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {errors.hoursPerWeek && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.hoursPerWeek}
          </span>
        )}
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-surface-700 mb-1">Count</span>
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
