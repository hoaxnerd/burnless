import type { ReactNode } from "react";
import type { FieldData } from "./types";

interface FormFieldProps {
  label: string;
  field: FieldData;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
  badge?: ReactNode;
}

export function FormField({
  label,
  field,
  placeholder,
  onChange,
  required,
  badge,
}: FormFieldProps) {
  return (
    <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
        {badge}
      </div>
      <input
        type="text"
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
          field.source === "ai"
            ? "border-brand-300 dark:border-brand-700"
            : "border-surface-300 dark:border-surface-600"
        }`}
      />
    </div>
  );
}
