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

/* ── Code-editor variant (S1-1 / A11Y-CTRL-03) ────────────────────────────────
 *
 * Dark mono surface for raw JSON/config/code entry (mockup `.code`:
 * JetBrains Mono 11.5px/1.7 on surface-900, radius-md, ~12px padding).
 * A variant here — not a hand-styled raw tag at the call site — because the
 * repo has no tailwind-merge: layering `bg-surface-900` over `controlClass`'s
 * `bg-surface-0` via the `extra` param resolves by CSS order, not class order,
 * so the override is nondeterministic. First consumer: MCP add-connection
 * paste-config textarea.
 */

/** Code box: radius, padding, mono type scale, width. */
export const codeControlBase =
  "block w-full resize-y rounded-lg p-3 font-mono text-[11.5px] leading-[1.7] transition-all";

/** Dark surface/text/placeholder (same in light + dark mode — it's a code area). */
export const codeControlSurface =
  "bg-surface-900 text-surface-100 placeholder:text-surface-400";

/**
 * Compose the code-editor control className (borderless; ring-only focus).
 * @param error  When true, applies the danger ring instead of brand.
 * @param extra  Caller-supplied className appended last (wins on conflicts).
 */
export function codeControlClass(error?: boolean, extra?: string): string {
  return [
    codeControlBase,
    codeControlSurface,
    error
      ? "focus:outline-none focus:ring-2 focus:ring-danger-500/40"
      : "focus:outline-none focus:ring-2 focus:ring-brand-500/40",
    controlDisabled,
    extra ?? "",
  ]
    .join(" ")
    .trim();
}
