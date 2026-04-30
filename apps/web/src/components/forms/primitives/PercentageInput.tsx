"use client";

export interface PercentageInputProps {
  value: number; // 0-1 engine value
  onChange: (next: number) => void;
  label: string;
  min?: number; // engine units. Default 0.
  max?: number; // engine units. Default 1.
  step?: number; // display step in 0-100. Default 0.1
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}

/**
 * PercentageInput — display 0-100 to user; emit 0-1 to engine.
 *
 * Engine values store fractional (0.05 for 5%); UI displays 5.
 */
export function PercentageInput({
  value,
  onChange,
  label,
  min = 0,
  max = 1,
  step = 0.1,
  required,
  disabled,
  hint,
}: PercentageInputProps) {
  // Strip trailing decimal zeros: 5.00 → "5", 5.50 → "5.5"
  const display = (value * 100).toFixed(2).replace(/\.?0+$/, "");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseFloat(e.target.value);
    if (isNaN(raw)) {
      onChange(0);
      return;
    }
    const clamped = Math.max(min, Math.min(max, raw / 100));
    onChange(clamped);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-surface-700 mb-1">
        {label}
        {required && <span className="text-danger-500"> *</span>}
      </label>
      <div className="relative">
        <input
          type="number"
          aria-label={label}
          value={display}
          min={min * 100}
          max={max * 100}
          step={step}
          required={required}
          disabled={disabled}
          onChange={handleChange}
          className="block w-full rounded-md border border-surface-300 bg-white py-2 pl-3 pr-8 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-surface-50 disabled:text-surface-500"
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-surface-500">
          %
        </span>
      </div>
      {hint && <p className="mt-1 text-xs text-surface-500">{hint}</p>}
    </div>
  );
}
