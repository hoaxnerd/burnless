/**
 * CardContent — describes what a slot displays.
 * Start with "metric" only. Add "chart" | "widget" later.
 */
export type CardContent =
  | { type: "metric"; slug: string }
  // Future:
  // | { type: "chart"; chartId: string; config?: Record<string, unknown> }
  // | { type: "widget"; widgetId: string }

/**
 * SlotConfig — a page's declaration of a single card slot.
 * Stable ID + default content. The system resolves overrides at render time.
 */
export interface SlotConfig {
  /** Stable slot identifier, e.g. "hero-0", "metric-1" */
  id: string;
  /** What this slot shows by default (before any user override) */
  defaultContent: CardContent;
}

/**
 * Resolved slot data ready for rendering.
 * Built server-side from ComputedMetrics + overrides.
 */
export interface ResolvedSlotData {
  slotId: string;
  content: CardContent;
  /** Formatted display values */
  label: string;
  value: string;
  change?: string;
  changeLabel?: string;
  description?: string;
  sparkData?: number[];
  /** Visual overrides from metric definition */
  metricStyle?: { icon: string; color: string; href: string };
  /** Whether this slot has actual data */
  hasData: boolean;
}
