"use client";

import { useState, useCallback, type InputHTMLAttributes, forwardRef } from "react";
import { formatNumber as fmtNum } from "@burnless/types";
import { Field } from "./field";
import { Input } from "./input";

/* ── FormField — input with inline validation and error hints ──────────────
 *
 * Public API is byte-compatible with the pre-Batch-C version (many consumers
 * depend on it). Internally it now delegates the label + a11y wiring to <Field>
 * and the styled control to <Input> (bare mode). It keeps its own id-from-label
 * derivation (so generated ids stay stable, e.g. "Company Name" → "company-name")
 * and its touched/validate state machine.
 */

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  hint?: string;
  error?: string;
  validate?: (value: string) => string | null;
  onChange?: (value: string) => void;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  function FormField({ label, hint, error: externalError, validate, onChange, className, id, ...props }, ref) {
    const [touched, setTouched] = useState(false);
    const [internalError, setInternalError] = useState<string | null>(null);

    const error = externalError || (touched ? internalError : null);

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setTouched(true);
        if (validate) {
          setInternalError(validate(e.target.value));
        }
        props.onBlur?.(e);
      },
      [validate, props],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onChange?.(val);
        if (touched && validate) {
          setInternalError(validate(val));
        }
      },
      [onChange, touched, validate],
    );

    const fieldId = id || label.toLowerCase().replace(/\s+/g, "-");

    return (
      <Field
        label={label}
        hint={hint}
        error={error ?? undefined}
        id={fieldId}
      >
        {(a11y) => (
          <Input
            ref={ref}
            {...a11y}
            invalid={Boolean(error)}
            className={className}
            {...props}
            onChange={handleChange}
            onBlur={handleBlur}
          />
        )}
      </Field>
    );
  },
);

/* ── CurrencyInput — formatted currency field ────────────────────────────── */

interface CurrencyInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Currency symbol to display (e.g., "$", "₹", "€"). */
  currency?: string;
  /** BCP 47 locale for number formatting (e.g., "en-US", "en-IN"). */
  locale?: string;
  hint?: string;
  error?: string;
  min?: number;
  max?: number;
  id?: string;
}

export function CurrencyInput({
  label,
  value,
  onChange,
  currency = "$",
  locale = "en-US",
  hint,
  error,
  min,
  max,
  id,
}: CurrencyInputProps) {
  function formatCurrencyDisplay(num: number): string {
    return fmtNum(num, locale);
  }

  const [displayValue, setDisplayValue] = useState(() => formatCurrencyDisplay(value));
  const [focused, setFocused] = useState(false);

  function parseCurrency(str: string): number {
    const cleaned = str.replace(/[^0-9.-]/g, "");
    return Number(cleaned) || 0;
  }

  const handleFocus = () => {
    setFocused(true);
    // Show raw number on focus for easy editing
    setDisplayValue(value === 0 ? "" : String(value));
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseCurrency(displayValue);
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
    onChange(clamped);
    setDisplayValue(formatCurrencyDisplay(clamped));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  };

  const fieldId = id || label.toLowerCase().replace(/\s+/g, "-");
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-medium text-surface-700 mb-2">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-surface-400 pointer-events-none">
          {currency}
        </span>
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          value={focused ? displayValue : formatCurrencyDisplay(value)}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-surface-0 pl-8 pr-4 py-3 text-sm text-surface-900 tabular-nums placeholder:text-surface-400 focus:outline-none focus:ring-2 transition-all ${
            error
              ? "border-danger-500 focus:ring-danger-500/40 focus:border-danger-500"
              : "border-surface-300 focus:ring-brand-500/40 focus:border-brand-500"
          }`}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-danger-600 animate-slide-up" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-surface-400">{hint}</p>
      )}
    </div>
  );
}
