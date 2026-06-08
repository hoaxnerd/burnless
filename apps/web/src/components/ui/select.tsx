"use client";

import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";
import { Field } from "./field";
import { controlClass } from "./control-styles";

/* ── Select — canonical native select (Batch-C S1-1) ──────────────────────────
 *
 * forwardRef, accepts native select props + { label?, hint?, error?, required? }.
 * Shares the canonical control style (control-styles.ts) so it lines up with
 * <Input>/<Textarea> incl. dark + disabled + error ring. Adds appearance-none
 * + room on the right for a chevron (rendered via the wrapper).
 *
 * Bare mode (no label/hint/error) renders just the styled <select> for use
 * inside an existing label.
 */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  showOptional?: boolean;
  wrapperClassName?: string;
  children?: ReactNode;
}

const selectExtra = "appearance-none pr-10 cursor-pointer";

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400"
    >
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    required,
    showOptional,
    wrapperClassName,
    className,
    id,
    children,
    ...props
  },
  ref,
) {
  const wrapped = label != null || hint != null || error != null;

  const control = (
    extraA11y?: { id?: string; "aria-invalid"?: boolean | undefined; "aria-describedby"?: string | undefined },
  ) => (
    <div className="relative">
      <select
        ref={ref}
        id={extraA11y?.id ?? id}
        required={required}
        aria-invalid={extraA11y?.["aria-invalid"] ?? (error ? true : undefined)}
        aria-describedby={extraA11y?.["aria-describedby"]}
        className={controlClass(
          Boolean(error),
          `${selectExtra} ${className ?? ""}`.trim(),
        )}
        {...props}
      >
        {children}
      </select>
      <Chevron />
    </div>
  );

  if (!wrapped) {
    return control();
  }

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      showOptional={showOptional}
      id={id}
      className={wrapperClassName}
    >
      {(a11y) => control(a11y)}
    </Field>
  );
});
