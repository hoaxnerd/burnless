"use client";

/**
 * Sub-form for `fixed` forecast method.
 * Engine field: { amount }.
 */

interface FixedParams {
  amount: number;
}

interface FixedFieldsProps {
  params: FixedParams;
  onChange: (next: FixedParams) => void;
  disabled?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function FixedFields({ params, onChange, disabled = false }: FixedFieldsProps) {
  return (
    <div>
      <label htmlFor="ff-amount" className="block text-sm font-medium text-surface-700 mb-1">
        Amount
      </label>
      <input
        id="ff-amount"
        type="number"
        step="0.01"
        min="0"
        value={Number.isFinite(params.amount) ? params.amount : 0}
        disabled={disabled}
        onChange={(e) =>
          onChange({ amount: e.target.value === "" ? 0 : Number(e.target.value) })
        }
        className={inputClass}
        placeholder="5000"
      />
      <p className="mt-1 text-xs text-surface-500">Per-period amount in your selected frequency.</p>
    </div>
  );
}
