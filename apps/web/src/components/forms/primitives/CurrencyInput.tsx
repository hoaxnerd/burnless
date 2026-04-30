"use client";

import { useLocale } from "@/components/locale/locale-context";

export interface CurrencyInputProps {
  value: number;
  onChange: (next: number) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string; // optional helper text (separate from the live preview)
  min?: number; // default 0
  step?: number; // default 0.01
}

export function CurrencyInput({
  value,
  onChange,
  label,
  required,
  disabled,
  hint,
  min = 0,
  step = 0.01,
}: CurrencyInputProps) {
  const { currencySymbol, fmtCurrency } = useLocale();
  return (
    <label className="block text-sm">
      <span className="text-surface-700 dark:text-surface-300">
        {label}
        {required && <span className="text-danger-500"> *</span>}
      </span>
      <div className="relative mt-1">
        <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-surface-500 text-xs pointer-events-none">
          {currencySymbol}
        </span>
        <input
          type="number"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          required={required}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => {
            const raw = parseFloat(e.target.value);
            onChange(Number.isNaN(raw) ? 0 : raw);
          }}
          className="block w-full rounded-md border-surface-300 dark:bg-surface-800 pl-7"
        />
      </div>
      <p
        className="mt-1 text-xs text-surface-500"
        data-testid="currency-input-preview"
      >
        = {fmtCurrency(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-surface-500">{hint}</p>}
    </label>
  );
}
