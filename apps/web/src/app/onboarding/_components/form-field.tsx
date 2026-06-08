import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import type { FieldData } from "./types";

interface FormFieldProps {
  label: string;
  field: FieldData;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
  badge?: ReactNode;
  type?: "text" | "number";
  min?: string;
  step?: string;
}

/**
 * Onboarding FormField — card wrapper with label + AI-source badge.
 * Public API is unchanged. The bare control now delegates to the canonical
 * <Input> (Batch-C S1-1) so it inherits dark + disabled styling; the
 * AI-source accent border is applied via className override.
 */
export function FormField({
  label,
  field,
  placeholder,
  onChange,
  required,
  badge,
  type = "text",
  min,
  step,
}: FormFieldProps) {
  const inputId = useId();
  return (
    <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
        {badge}
      </div>
      <Input
        id={inputId}
        type={type}
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        step={step}
        className={
          field.source === "ai"
            ? "border-brand-300 dark:border-brand-700"
            : undefined
        }
      />
    </div>
  );
}
