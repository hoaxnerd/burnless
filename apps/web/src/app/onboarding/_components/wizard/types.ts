/**
 * Imperative contract between a wizard step and the wizard shell.
 *
 * Each wizard step panel exposes a `submit()` via `useImperativeHandle`. The
 * global Continue button (in `page.tsx`) holds a ref to the ACTIVE step and
 * calls `submit()`; it advances only when `submit()` resolves `true`. Skip
 * advances WITHOUT calling `submit()` (discarding the step's pending work).
 */
export interface WizardStepHandle {
  /** Persist this step's pending work. Return true to allow the wizard to advance. */
  submit(): Promise<boolean>;
}
