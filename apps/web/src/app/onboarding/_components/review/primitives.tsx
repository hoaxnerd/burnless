/**
 * Layout primitives used across all review-step sections.
 *
 * `SectionCard`     — the labeled card that wraps each whole section.
 * `SuggestionCard`  — a checkbox-headed card for one row inside a suggestion
 *                     section (revenue stream, funding round, hire, expense).
 *                     Encapsulates the selected-vs-dimmed styling so each
 *                     section's content can focus on its own fields.
 * `InlineField`     — labeled input with optional currency/text prefix + AI
 *                     border indicator.
 * `ToggleGroup`     — segmented button group for enum-like fields.
 */

import type { ReactNode, ElementType } from "react";

export function SectionCard({
  icon: Icon,
  title,
  children,
  delay = 0,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="rounded-2xl bg-surface-0 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700 p-5 shadow-sm hover:shadow transition-all duration-200 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export function SuggestionCard({
  selected,
  onToggleSelected,
  children,
  checkboxAlign = "start",
}: {
  selected: boolean;
  onToggleSelected: (next: boolean) => void;
  children: ReactNode;
  /** "start" stacks the checkbox at the top-left; "center" pairs it with a header row. */
  checkboxAlign?: "start" | "center";
}) {
  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        selected
          ? "border-accent-300 dark:border-accent-800 bg-accent-50/10 dark:bg-accent-950/5 shadow-sm border-l-4 border-l-brand-600"
          : "border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900/30 opacity-60"
      }`}
    >
      {checkboxAlign === "start" ? (
        <div className="p-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelected(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
          />
          <div className="flex-1 space-y-3">{children}</div>
        </div>
      ) : (
        <>{children}</>
      )}
    </div>
  );
}

export function InlineField({
  label,
  field,
  placeholder,
  onChange,
  required,
  badge,
  type = "text",
  min,
  step,
  prefix,
  error,
  onBlur,
}: {
  label: string;
  field: { value: string; source: string };
  placeholder: string;
  onChange: (v: string) => void;
  required?: boolean;
  badge?: ReactNode;
  type?: "text" | "number";
  min?: string;
  step?: string;
  prefix?: string;
  error?: string;
  onBlur?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
        {badge}
      </div>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-surface-400">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={field.value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          min={min}
          step={step}
          className={`w-full rounded-lg border bg-surface-0 dark:bg-surface-900 ${prefix ? "pl-7 pr-3" : "px-3"} py-2 text-sm text-surface-900 dark:text-surface-50 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors ${
            error
              ? "border-danger-500"
              : field.source === "ai"
                ? "border-accent-300 dark:border-accent-700"
                : "border-surface-300 dark:border-surface-600"
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
    </div>
  );
}

export function ToggleGroup({
  label,
  options,
  value,
  onChange,
  badge,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  badge?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
        {badge}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              value === option
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small text input used inside SuggestionCard rows. */
export function MiniInput({
  type = "text",
  value,
  onChange,
  placeholder,
  className = "",
}: {
  type?: "text" | "number" | "date";
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 px-2 py-1 text-xs focus:ring-2 focus:ring-brand-500 ${className}`}
    />
  );
}

/** Small select used inside SuggestionCard rows. */
export function MiniSelect<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 px-2 py-1 text-xs focus:ring-2 focus:ring-brand-500 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Number input prefixed by a currency symbol — used inside SuggestionCards. */
export function CurrencyInput({
  symbol,
  value,
  onChange,
  className = "",
}: {
  symbol: string;
  value: number | string;
  onChange: (next: number) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-surface-400">
        {symbol}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 pl-5 pr-2 py-1 text-xs focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
