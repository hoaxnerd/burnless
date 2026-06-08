"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Field } from "./field";
import { controlClass } from "./control-styles";

/* ── Input — canonical text input (Batch-C S1-1) ──────────────────────────────
 *
 * forwardRef, accepts native input props + { label?, hint?, error?, required? }.
 * ONE canonical style (control-styles.ts) incl. dark + disabled + error ring.
 *
 * When label/hint/error/required is supplied, the input is wrapped in <Field>
 * (owns label + a11y wiring). When none is supplied, it renders bare — so the
 * forms/primitives kit can drop it inside its own <label> without a duplicate
 * label/wrapper. In the bare case the caller is responsible for a11y (the
 * primitives already pass aria-label).
 */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /**
   * Force the danger/error border+ring without a wrapping <Field> message.
   * Used by callers that own their own error rendering (e.g. FormField, which
   * delegates label+a11y to <Field> and passes the control through in bare
   * mode). Ignored in wrapped mode (error string drives styling there).
   */
  invalid?: boolean;
  /** Show an "(optional)" marker when not required (only in wrapped mode). */
  showOptional?: boolean;
  /** Extra className on the <Field> wrapper (wrapped mode only). */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    invalid,
    required,
    showOptional,
    wrapperClassName,
    className,
    id,
    ...props
  },
  ref,
) {
  const wrapped = label != null || hint != null || error != null;

  if (!wrapped) {
    const hasError = invalid ?? false;
    return (
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={hasError ? true : undefined}
        className={controlClass(hasError, className)}
        {...props}
      />
    );
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
      {(a11y) => (
        <input
          ref={ref}
          required={required}
          className={controlClass(Boolean(error), className)}
          {...a11y}
          {...props}
        />
      )}
    </Field>
  );
});
