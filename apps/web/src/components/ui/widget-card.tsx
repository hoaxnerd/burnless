"use client";

/**
 * WidgetCard — unified root component for all card/widget types across pages.
 *
 * Provides consistent card chrome (border, background, padding, hover effects,
 * animation stagger) and auto-injects the CardSettings gear when slug+pageId
 * are provided. Reads card mode state from MetricsContext automatically.
 *
 * Usage:
 *   <WidgetCard slug="mrr" pageId="dashboard" stagger={2}>
 *     {/* card content *\/}
 *   </WidgetCard>
 */

import { type ReactNode, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useOptionalMetrics,
  type CardMode,
} from "@/components/providers/metrics-context";
import { useOptionalAiFlags } from "@/components/ai/ai-feature-context";
import { useOptionalCardCatalog } from "@/components/providers/card-catalog-context";
import { CardSettings } from "./card-settings";

// ── Component ────────────────────────────────────────────────────────────────

export interface WidgetCardProps {
  children: ReactNode;

  /** Metric/widget slug — required for settings gear to appear */
  slug?: string;
  /** Page this card belongs to (e.g., "dashboard", "expenses") */
  pageId?: string;

  /** Show settings gear. Auto-enabled when slug + pageId + MetricsProvider available. */
  showSettings?: boolean;
  /** "floating" positions gear above the card border; "inset" positions inside the card. */
  settingsPosition?: "floating" | "inset";
  /** Extra class names appended to the card container. */
  className?: string;
  /** Animation stagger index (maps to stagger-N utility class). */
  stagger?: number;
  /** Whether to skip the card's default padding (for cards managing their own). */
  noPadding?: boolean;
  /**
   * Bare mode: renders only a transparent `relative group` wrapper with
   * the settings gear overlay — no card chrome (border, background, shadow).
   * Use when the child already provides its own card container (e.g., MetricCard).
   */
  bare?: boolean;

  /** Click handler. When provided, card gets cursor-pointer. Settings clicks do not propagate. */
  onClick?: (e: React.MouseEvent) => void;
  /** Keyboard handler for accessible click targets. */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** ARIA role (e.g., "link" when card navigates). */
  role?: string;
  /** Tab index for keyboard navigation. */
  tabIndex?: number;
  /** Tooltip text. */
  title?: string;
}

export function WidgetCard({
  children,
  slug,
  pageId,
  showSettings,
  settingsPosition = "floating",
  className = "",
  stagger,
  noPadding = false,
  bare = false,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  title,
}: WidgetCardProps) {
  const router = useRouter();
  const metrics = useOptionalMetrics();
  const catalog = useOptionalCardCatalog();
  const aiFlags = useOptionalAiFlags();
  const aiEnabled = aiFlags?.masterEnabled ?? false;
  const settingsActiveRef = useRef(false);

  // Resolve whether to show settings
  const hasSettings =
    showSettings ?? !!(slug && pageId && metrics);

  // Read card mode from context
  const currentMode: CardMode =
    slug && pageId && metrics
      ? metrics.getCardMode(pageId, slug)
      : "dynamic";

  const isOverride =
    slug && pageId && metrics ? metrics.hasOverride(pageId, slug) : false;

  const handleModeChange = useMemo(() => {
    if (!slug || !pageId || !metrics) return undefined;
    return (mode: CardMode | null) => metrics.setCardMode(pageId, slug, mode);
  }, [slug, pageId, metrics]);

  // Intercept clicks: if the settings gear was just used, don't propagate to card onClick
  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        if (settingsActiveRef.current) {
          settingsActiveRef.current = false;
          return;
        }
        onClick(e);
      }
    : undefined;

  const isFloating = settingsPosition === "floating";

  return (
    <div
      role={role}
      tabIndex={tabIndex}
      title={title}
      onKeyDown={onKeyDown}
      onClick={handleClick}
      className={
        bare
          ? `relative group ${className}`
          : `
        relative group h-full flex flex-col
        rounded-2xl bg-surface-0 border border-surface-200
        ${noPadding ? "" : "p-5 sm:p-6"}
        transition-all duration-300
        hover:border-surface-300 hover-lift
        ${stagger != null ? `animate-slide-up stagger-${stagger}` : ""}
        ${onClick ? "cursor-pointer" : ""}
        ${""}
        ${className}
      `
      }
    >
      {/* Settings gear */}
      {hasSettings && handleModeChange && (
        <div
          className={
            isFloating
              ? "absolute -top-1 right-2 z-20 rounded-full bg-surface-0 ring-1 ring-surface-200 shadow-sm"
              : "absolute top-3 right-3 z-10"
          }
          onMouseDown={() => {
            settingsActiveRef.current = true;
          }}
        >
          <CardSettings
            currentMode={currentMode}
            onModeChange={handleModeChange}
            isOverride={isOverride}
            aiEnabled={aiEnabled}
            catalogProps={catalog ?? undefined}
            onResetForCard={
              slug && catalog?.onResetForCard
                ? () => catalog.onResetForCard?.(slug)
                : undefined
            }
            onSaveForCard={slug && pageId && metrics
              ? (selectedSlug: string) => {
                  if (catalog?.onSaveForCard) {
                    // Dashboard-style: page manages its own card slugs.
                    // Transfer mode since the card's slug will change.
                    const mode = metrics.getCardMode(pageId, slug);
                    metrics.setCardMode(pageId, selectedSlug, mode);
                    if (metrics.hasOverride(pageId, slug)) {
                      metrics.setCardMode(pageId, slug, null);
                    }
                    catalog.onSaveForCard(slug, selectedSlug);
                  } else {
                    // Centralized: store custom slug override in MetricsContext.
                    // Mode stays on the original slot slug (no transfer needed).
                    metrics.setSlotOverride(pageId, slug, { type: "metric", slug: selectedSlug });
                  }
                  router.refresh();
                }
              : undefined}
          />
        </div>
      )}

      {children}
    </div>
  );
}
