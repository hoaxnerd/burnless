"use client";

import type { HeadcountFormState } from "@/lib/headcount-params";
import { CurrencyInput, NumberInput } from "@/components/forms/primitives";

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
      <div>
        <CurrencyInput
          label="Annual salary"
          value={state.salary}
          onChange={(next) => onChange({ salary: next })}
          min={0}
          step={1}
        />
        {errors.salary && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.salary}
          </span>
        )}
      </div>
      <div>
        <NumberInput
          label="Count (FTE)"
          value={state.count}
          onChange={(next) => onChange({ count: next ?? 0 })}
          step={0.5}
          min={0.01}
          max={99.99}
        />
        {errors.count && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.count}
          </span>
        )}
      </div>
      <div className="col-span-2 rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-xs text-surface-500">
        Monthly cost ~ {monthlyCost.toFixed(0)} (excl. benefits)
      </div>
    </div>
  );
}
