/**
 * Canonical form-control style tokens (Batch-C S1-1, REV-03).
 *
 * ONE signature shared by <Input>, <Select>, <Textarea>. Matches the style
 * contract: rounded-xl, px-4 py-3 text-sm, surface-300 border, brand focus
 * ring, placeholder + dark + disabled variants. Components compose these with
 * an error-state override (danger ring) where applicable.
 *
 * Kept as a string constant (no `cn` util exists in this repo — components
 * concatenate via template literals; see ui/button.tsx).
 */

/** Base box: radius, padding, type scale, width. */
export const controlBase =
  "block w-full rounded-xl px-4 py-3 text-sm transition-all";

/** Surface/text/placeholder colors incl. dark mode. */
export const controlSurface =
  "bg-surface-0 text-surface-900 placeholder:text-surface-400 " +
  "dark:bg-surface-900 dark:text-surface-50";

/** Focus ring + border in the default (non-error) state, incl. dark border. */
export const controlBorderDefault =
  "border border-surface-300 dark:border-surface-700 " +
  "focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500";

/** Focus ring + border in the error state (danger). */
export const controlBorderError =
  "border border-danger-500 " +
  "focus:outline-none focus:ring-2 focus:ring-danger-500/40 focus:border-danger-500";

/** Disabled affordance. */
export const controlDisabled =
  "disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Compose the canonical control className.
 * @param error  When true, applies the danger border/ring instead of default.
 * @param extra  Caller-supplied className appended last (wins on conflicts).
 */
export function controlClass(error?: boolean, extra?: string): string {
  return [
    controlBase,
    controlSurface,
    error ? controlBorderError : controlBorderDefault,
    controlDisabled,
    extra ?? "",
  ]
    .join(" ")
    .trim();
}
