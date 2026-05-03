"use client";

/**
 * Sub-form for `growth_rate` forecast method.
 * Engine fields: { baseAmount, monthlyGrowthRate }. NOT `growthRate`.
 */

interface GrowthRateParams {
  baseAmount: number;
  monthlyGrowthRate: number;
}

interface GrowthRateFieldsProps {
  params: GrowthRateParams;
  onChange: (next: GrowthRateParams) => void;
  disabled?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function GrowthRateFields({ params, onChange, disabled = false }: GrowthRateFieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="gr-base" className="block text-sm font-medium text-surface-700 mb-1">
          Base amount
        </label>
        <input
          id="gr-base"
          type="number"
          step="0.01"
          min="0"
          value={Number.isFinite(params.baseAmount) ? params.baseAmount : 0}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...params,
              baseAmount: e.target.value === "" ? 0 : Number(e.target.value),
            })
          }
          className={inputClass}
          placeholder="5000"
        />
      </div>
      <div>
        <label htmlFor="gr-rate" className="block text-sm font-medium text-surface-700 mb-1">
          Monthly growth rate
        </label>
        <input
          id="gr-rate"
          type="number"
          step="0.001"
          value={Number.isFinite(params.monthlyGrowthRate) ? params.monthlyGrowthRate : 0}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...params,
              monthlyGrowthRate: e.target.value === "" ? 0 : Number(e.target.value),
            })
          }
          className={inputClass}
          placeholder="0.05"
        />
        <p className="mt-1 text-xs text-surface-500">
          Decimal form, e.g. 0.05 = 5% per month.
        </p>
      </div>
    </div>
  );
}
