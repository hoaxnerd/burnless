"use client";

import type { HeadcountFormState } from "@/lib/headcount-params";
import { CurrencyInput, NumberInput } from "@/components/forms/primitives";

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
      <div>
        <CurrencyInput
          label="Hourly rate"
          value={state.hourlyRate ?? 0}
          onChange={(next) => onChange({ hourlyRate: next === 0 ? null : next })}
          min={0}
          step={0.5}
        />
        {errors.hourlyRate && (
          <span className="mt-1.5 block text-xs font-medium text-danger-600 field-error" role="alert">
            {errors.hourlyRate}
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
