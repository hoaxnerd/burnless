"use client";

import { FULL_TIME_HOURS_PER_WEEK, type HeadcountFormState } from "@/lib/headcount-params";
import { CurrencyInput, NumberInput } from "@/components/forms/primitives";

interface Props {
  state: HeadcountFormState;
  errors: Record<string, string>;
  onChange: (partial: Partial<HeadcountFormState>) => void;
}

/**
 * Part-time-specific fields: annual salary + hoursPerWeek + count.
 * Monthly cost preview = salary/12 × (hoursPerWeek/40) × count.
 */
export function PartTimeFields({ state, errors, onChange }: Props) {
  const hoursFraction = (state.hoursPerWeek ?? 0) / FULL_TIME_HOURS_PER_WEEK;
  const monthlyCost = ((state.salary || 0) / 12) * hoursFraction * (state.count || 0);

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="part-time-fields">
      <div>
        <CurrencyInput
          label="Annual salary (full-time equivalent)"
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
          label="Hours per week"
          value={state.hoursPerWeek}
          onChange={(next) => onChange({ hoursPerWeek: next })}
          min={0}
          max={168}
          step={0.5}
        />
        {errors.hoursPerWeek && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.hoursPerWeek}
          </span>
        )}
      </div>
      <div>
        <NumberInput
          label="Count"
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
