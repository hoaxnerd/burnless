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

/** Surface/text/placeholder colors. Dark mode needs NO dark:* utilities here:
 *  the .dark scope FLIPS the surface variables (surface-0 → navy #0f1729,
 *  surface-900 → near-white #eef0f5), so these same tokens restyle themselves.
 *  Explicit dark:bg-surface-900 (removed) was authored against the literal
 *  light palette and resolved to #eef0f5 — near-WHITE inputs — under class-dark. */
export const controlSurface =
  "bg-surface-0 text-surface-900 placeholder:text-surface-400";

/** Focus ring + border in the default (non-error) state (border-surface-300
 *  flips to #344263 in .dark via the variable scale — no dark: utility). */
export const controlBorderDefault =
  "border border-surface-300 " +
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

/** Always-dark surface/text/placeholder — it's a code area in BOTH modes.
 *  The .dark scope flips the surface scale, so "always dark" needs flipped
 *  tokens per mode: light → surface-900 (#111827); dark → surface-100
 *  (#1a2340, slightly elevated vs the #0f1729 page). Text mirrors the flip. */
export const codeControlSurface =
  "bg-surface-900 text-surface-100 placeholder:text-surface-400 " +
  "dark:bg-surface-100 dark:text-surface-900";

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
