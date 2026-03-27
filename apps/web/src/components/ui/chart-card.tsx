"use client";

/**
 * ChartCard — chart wrapper that uses WidgetCard for consistent card chrome.
 *
 * When slug + pageId are provided, auto-injects the settings gear for
 * per-card mode switching. Otherwise renders as a simple presentation card.
 */

import { WidgetCard } from "./widget-card";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Chart identifier for per-card mode switching */
  slug?: string;
  /** Page this chart belongs to (e.g., "expenses", "revenue") */
  pageId?: string;
}

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  slug,
  pageId,
}: ChartCardProps) {
  return (
    <WidgetCard slug={slug} pageId={pageId} className="!rounded-xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-surface-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </WidgetCard>
  );
}
