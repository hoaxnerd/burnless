"use client";

export interface NumberInputProps {
  value: number | null;
  onChange: (next: number | null) => void;
  label: string;
  min?: number;
  max?: number | null; // null = unbounded
  step?: number;
  integerOnly?: boolean;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}

export function NumberInput({
  value,
  onChange,
  label,
  min,
  max,
  step,
  integerOnly = false,
  required,
  disabled,
  hint,
}: NumberInputProps) {
  return (
    <label className="block text-sm">
      <span className="text-surface-700 dark:text-surface-300">
        {label}
        {required && <span className="text-danger-500"> *</span>}
      </span>
      <input
        type="number"
        value={value === null ? "" : value}
        min={min}
        max={max ?? undefined}
        step={integerOnly ? 1 : step}
        required={required}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          let parsed = parseFloat(raw);
          if (Number.isNaN(parsed)) {
            onChange(null);
            return;
          }
          if (integerOnly) parsed = Math.trunc(parsed);
          if (min !== undefined) parsed = Math.max(min, parsed);
          if (max !== undefined && max !== null) parsed = Math.min(max, parsed);
          onChange(parsed);
        }}
        className="mt-1 block w-full rounded-md border border-surface-300 dark:bg-surface-800"
      />
      {hint && <p className="mt-1 text-xs text-surface-500">{hint}</p>}
    </label>
  );
}
