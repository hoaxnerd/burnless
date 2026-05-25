"use client";

/**
 * Sub-form for `growth_rate` forecast method.
 * Engine fields: { baseAmount, monthlyGrowthRate }. NOT `growthRate`.
 *
 * `monthlyGrowthRate` is stored as a 0-1 fractional decimal in the engine.
 * PercentageInput handles the 0-1 ↔ 0-100 display conversion automatically.
 */

import { CurrencyInput, PercentageInput } from "@/components/forms/primitives";

interface GrowthRateParams {
  baseAmount: number;
  monthlyGrowthRate: number;
}

interface GrowthRateFieldsProps {
  params: GrowthRateParams;
  onChange: (next: GrowthRateParams) => void;
  disabled?: boolean;
}

export function GrowthRateFields({ params, onChange, disabled = false }: GrowthRateFieldsProps) {
  return (
    <div className="space-y-3">
      <CurrencyInput
        label="Base amount"
        value={params.baseAmount}
        onChange={(v) => onChange({ ...params, baseAmount: v })}
        required
        disabled={disabled}
      />
      <PercentageInput
        label="Monthly growth rate"
        value={params.monthlyGrowthRate}
        onChange={(v) => onChange({ ...params, monthlyGrowthRate: v })}
        disabled={disabled}
        min={-1}
        max={10}
        step={0.1}
      />
    </div>
  );
}
