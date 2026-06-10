"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { Field } from "./field";
import { codeControlClass, controlClass } from "./control-styles";

/* ── Textarea — canonical multi-line input (Batch-C S1-1) ─────────────────────
 *
 * forwardRef, accepts native textarea props + { label?, hint?, error?, required? }.
 * Shares the canonical control style (control-styles.ts). Bare mode renders the
 * styled <textarea> alone for use inside an existing label.
 * `variant="code"` swaps in the dark mono code-editor surface
 * (codeControlClass) for raw JSON/config entry.
 */

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  showOptional?: boolean;
  wrapperClassName?: string;
  /** "code" = dark mono code-editor surface (e.g. MCP config paste). */
  variant?: "default" | "code";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      hint,
      error,
      required,
      showOptional,
      wrapperClassName,
      className,
      id,
      variant = "default",
      ...props
    },
    ref,
  ) {
    const wrapped = label != null || hint != null || error != null;
    const compose = variant === "code" ? codeControlClass : controlClass;

    if (!wrapped) {
      return (
        <textarea
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          className={compose(Boolean(error), className)}
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
          <textarea
            ref={ref}
            required={required}
            className={compose(Boolean(error), className)}
            {...a11y}
            {...props}
          />
        )}
      </Field>
    );
  },
);
