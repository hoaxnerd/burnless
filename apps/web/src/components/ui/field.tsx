"use client";

import {
  useId,
  type ReactNode,
} from "react";

/* ── Field — canonical label + hint + error + a11y wiring (Batch-C S1-1) ──────
 *
 * Wraps a single form control with its <label>, optional hint, optional error
 * message, and a required/optional marker. Owns the a11y contract so callers
 * don't re-implement it:
 *   - a stable id (generated if not supplied) wired label.htmlFor ↔ control.id
 *   - aria-invalid when error present
 *   - aria-describedby pointing at error (role="alert") or hint
 *
 * Uses a render-prop so the control receives the resolved id + aria-* props.
 * <Input>/<Select>/<Textarea> spread these onto their native element.
 */

export interface FieldA11yProps {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
}

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Render the "optional" marker when not required. Default false. */
  showOptional?: boolean;
  /** Explicit id; generated via useId() when omitted. */
  id?: string;
  /** Extra className on the outer wrapper. */
  className?: string;
  /** Receives the resolved id + aria props to spread on the control. */
  children: (a11y: FieldA11yProps) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  showOptional = false,
  id,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const a11y: FieldA11yProps = {
    id: fieldId,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
        >
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
          {!required && showOptional && (
            <span className="text-surface-400 font-normal ml-1.5">
              (optional)
            </span>
          )}
        </label>
      )}
      {children(a11y)}
      {error && (
        <p
          id={errorId}
          className="mt-1.5 text-xs font-medium text-danger-600 animate-slide-up"
          role="alert"
        >
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-surface-400">
          {hint}
        </p>
      )}
    </div>
  );
}
