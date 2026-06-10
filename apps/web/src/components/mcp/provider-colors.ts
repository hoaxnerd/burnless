import type { CSSProperties } from "react";

/**
 * Known MCP provider brand colors — the ONLY permitted color literals in the
 * MCP UI (pixel contract: brand glyph backgrounds may use the provider's real
 * brand color; everything else routes through design-system tokens).
 */
export const PROVIDER_COLORS: Record<string, string> = {
  stripe: "#635bff",
  linear: "#5e6ad2",
  github: "#24292f",
  notion: "#000000",
  sentry: "#362d59",
  asana: "#f06a6a",
};

/** Glyph chip background: brand color when known, highlight token otherwise. */
export function glyphStyle(slug: string): CSSProperties {
  return {
    backgroundColor: PROVIDER_COLORS[slug] ?? "var(--color-highlight-500)",
  };
}
