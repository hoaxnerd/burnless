"use client";

import { Info, AlertTriangle } from "lucide-react";
import type { InsightCacheState } from "./use-insight-cache";

/** Human-readable labels for stale reasons. */
const STALE_REASON_LABELS: Record<string, string> = {
  revenue_edited: "revenue data",
  headcount_edited: "headcount data",
  expenses_edited: "expense data",
  funding_edited: "funding data",
  scenarios_edited: "scenario data",
  accounts_edited: "account data",
  departments_edited: "department data",
  "forecast-lines_edited": "forecast data",
};

/** Format remaining grace as M:SS (e.g. 277000 → "4:37"). */
function formatGraceRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface StaleInsightBannerProps {
  stale: boolean;
  dataChanged: boolean;
  graceRemaining: number | null;
  staleReason: string | null;
  canRefresh: boolean;
  loading: boolean;
  autoRegenerating: boolean;
  onRefresh: () => void;
}

/**
 * Generic staleness banner for any AI insight widget.
 * Shows context-appropriate messages based on staleness state.
 *
 * Usage:
 * ```tsx
 * <StaleInsightBanner {...cache} onRefresh={cache.refresh} />
 * ```
 */
export function StaleInsightBanner({
  stale,
  dataChanged,
  graceRemaining,
  staleReason,
  canRefresh,
  loading,
  autoRegenerating,
  onRefresh,
}: StaleInsightBannerProps) {
  if (autoRegenerating) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-brand-500/15 bg-brand-50/30 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-brand-500 flex-shrink-0 animate-pulse" />
        <p className="text-xs text-brand-700">Updating insights…</p>
      </div>
    );
  }

  // Data changed + grace period active
  if (dataChanged && graceRemaining !== null && graceRemaining > 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-brand-500/15 bg-brand-50/30 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-brand-500 flex-shrink-0" />
        <p className="text-xs text-brand-700">
          Your data changed. Insights update in {formatGraceRemaining(graceRemaining)}.
          <button
            onClick={onRefresh}
            disabled={loading}
            className="ml-1 underline hover:no-underline font-medium"
          >
            Refresh now
          </button>
        </p>
      </div>
    );
  }

  // Data changed + grace elapsed
  if (dataChanged && (graceRemaining === null || graceRemaining <= 0)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning-500/20 bg-warning-50/50 px-3 py-2">
        <AlertTriangle className="h-3.5 w-3.5 text-warning-500 flex-shrink-0" />
        <p className="text-xs text-warning-700">
          {staleReason && STALE_REASON_LABELS[staleReason]
            ? `These insights were generated before your recent changes to ${STALE_REASON_LABELS[staleReason]}. They may no longer be accurate.`
            : "These insights may not reflect your recent data changes."}
          {canRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="ml-1 underline hover:no-underline font-medium"
            >
              Refresh now
            </button>
          )}
        </p>
      </div>
    );
  }

  // Time-based staleness (>24h, no data change)
  if (stale && !dataChanged) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning-500/20 bg-warning-50/50 px-3 py-2">
        <AlertTriangle className="h-3.5 w-3.5 text-warning-500 flex-shrink-0" />
        <p className="text-xs text-warning-700">
          These insights are over 24 hours old and may not reflect recent changes.
          {canRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="ml-1 underline hover:no-underline font-medium"
            >
              Refresh now
            </button>
          )}
        </p>
      </div>
    );
  }

  return null;
}
