"use client";

/**
 * Sub-form for `per_unit` forecast method.
 * Engine fields: { units, pricePerUnit, unitGrowthRate?, priceGrowthRate? }.
 * NOT `driver` / `unitPrice`.
 */

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

const inputClass =
  "w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500";

function toOptionalNumber(s: string): number | undefined {
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function PerUnitFields({ params, onChange, disabled = false }: PerUnitFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pu-units" className="block text-sm font-medium text-surface-700 mb-1">
            Units
          </label>
          <input
            id="pu-units"
            type="number"
            step="1"
            min="0"
            value={Number.isFinite(params.units) ? params.units : 0}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...params,
                units: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
            className={inputClass}
            placeholder="100"
          />
        </div>
        <div>
          <label htmlFor="pu-price" className="block text-sm font-medium text-surface-700 mb-1">
            Price per unit
          </label>
          <input
            id="pu-price"
            type="number"
            step="0.01"
            min="0"
            value={Number.isFinite(params.pricePerUnit) ? params.pricePerUnit : 0}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...params,
                pricePerUnit: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
            className={inputClass}
            placeholder="49.99"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pu-ugrowth" className="block text-sm font-medium text-surface-700 mb-1">
            Unit growth rate <span className="text-surface-400 font-normal">(optional)</span>
          </label>
          <input
            id="pu-ugrowth"
            type="number"
            step="0.001"
            value={params.unitGrowthRate ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...params, unitGrowthRate: toOptionalNumber(e.target.value) })
            }
            className={inputClass}
            placeholder="0.02"
          />
        </div>
        <div>
          <label htmlFor="pu-pgrowth" className="block text-sm font-medium text-surface-700 mb-1">
            Price growth rate <span className="text-surface-400 font-normal">(optional)</span>
          </label>
          <input
            id="pu-pgrowth"
            type="number"
            step="0.001"
            value={params.priceGrowthRate ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...params, priceGrowthRate: toOptionalNumber(e.target.value) })
            }
            className={inputClass}
            placeholder="0.01"
          />
        </div>
      </div>
      <p className="text-xs text-surface-500">
        Growth rates are decimals (0.02 = 2% per month).
      </p>
    </div>
  );
}
