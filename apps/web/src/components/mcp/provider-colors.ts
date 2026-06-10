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
  paypal: "#003087",
  square: "#006aff",
  mercury: "#5266eb",
  plaid: "#111111",
  xero: "#13b5ea",
  slack: "#4a154b",
  intercom: "#0057ff",
  atlassian: "#0052cc",
  monday: "#6161ff",
  hubspot: "#ff7a59",
  canva: "#8b3dff",
};

/** Glyph chip background: brand color when known, highlight token otherwise. */
export function glyphStyle(slug: string): CSSProperties {
  return {
    backgroundColor: PROVIDER_COLORS[slug] ?? "var(--color-highlight-500)",
  };
}
