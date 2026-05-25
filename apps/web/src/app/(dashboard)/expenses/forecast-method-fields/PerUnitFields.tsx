"use client";

/**
 * Sub-form for `per_unit` forecast method.
 * Engine fields: { units, pricePerUnit, unitGrowthRate?, priceGrowthRate? }.
 * NOT `driver` / `unitPrice`.
 *
 * Growth rates are stored as 0-1 fractional decimals in the engine.
 * PercentageInput handles the 0-1 ↔ 0-100 display conversion automatically;
 * null from NumberInput is normalised to undefined at the boundary.
 */

import { CurrencyInput, NumberInput, PercentageInput } from "@/components/forms/primitives";

interface PerUnitParams {
  units: number;
  pricePerUnit: number;
  unitGrowthRate?: number;
  priceGrowthRate?: number;
}

interface PerUnitFieldsProps {
  params: PerUnitParams;
  onChange: (next: PerUnitParams) => void;
  disabled?: boolean;
}

export function PerUnitFields({ params, onChange, disabled = false }: PerUnitFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumberInput
          label="Units"
          value={Number.isFinite(params.units) ? params.units : 0}
          // NumberInput emits number | null; coerce null → 0 to satisfy PerUnitParams.units: number
          onChange={(v) => onChange({ ...params, units: v ?? 0 })}
          required
          disabled={disabled}
          min={0}
          integerOnly
        />
        <CurrencyInput
          label="Price per unit"
          value={params.pricePerUnit}
          onChange={(v) => onChange({ ...params, pricePerUnit: v })}
          required
          disabled={disabled}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PercentageInput
          label="Unit growth rate (optional)"
          // engine stores 0-1 fractional; PercentageInput displays as 0-100
          value={params.unitGrowthRate ?? 0}
          onChange={(v) => onChange({ ...params, unitGrowthRate: v === 0 ? undefined : v })}
          disabled={disabled}
          min={-1}
          max={10}
          step={0.1}
        />
        <PercentageInput
          label="Price growth rate (optional)"
          value={params.priceGrowthRate ?? 0}
          onChange={(v) => onChange({ ...params, priceGrowthRate: v === 0 ? undefined : v })}
          disabled={disabled}
          min={-1}
          max={10}
          step={0.1}
        />
      </div>
    </div>
  );
}
