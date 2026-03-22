"use client";

import { useState, useEffect, useCallback } from "react";
import { captureException } from "@/lib/error-reporting";
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  BarChart3,
  GraduationCap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { AiGate } from "./ai-gate";
import { useAiFeature } from "./ai-feature-context";
import { DataLoadError, classifyError } from "@/components/ui/data-load-error";

// ── Types ────────────────────────────────────────────────────────────────────

type InsightType =
  | "variance_analysis"
  | "runway_alert"
  | "financial_narrative"
  | "benchmark"
  | "coaching";

interface PageInsight {
  type: InsightType;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
}

interface AiPageInsightsProps {
  /** Which page these insights are for */
  page: "expenses" | "revenue" | "scenarios";
  /** Scenario ID for context */
  scenarioId: string;
  /** Additional page-specific data to send to the API */
  pageData?: Record<string, unknown>;
}

// ── Severity styles ─────────────────────────────────────────────────────────

const severityConfig = {
  critical: {
    border: "border-danger-500/20",
    bg: "bg-danger-50/50",
    iconColor: "text-danger-500",
    dot: "bg-danger-500",
  },
  warning: {
    border: "border-warning-500/20",
    bg: "bg-warning-50/50",
    iconColor: "text-warning-500",
    dot: "bg-warning-500",
  },
  info: {
    border: "border-brand-500/15",
    bg: "bg-brand-50/30",
    iconColor: "text-brand-500",
    dot: "bg-brand-500",
  },
} as const;

const typeIcons: Record<InsightType, typeof TrendingUp> = {
  variance_analysis: BarChart3,
  runway_alert: ShieldAlert,
  financial_narrative: TrendingUp,
  benchmark: BarChart3,
  coaching: GraduationCap,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a timestamp as a human-readable relative age. */
function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AiPageInsights({ page, scenarioId, pageData }: AiPageInsightsProps) {
  const [insights, setInsights] = useState<PageInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorVariant, setErrorVariant] = useState<ReturnType<typeof classifyError>>("generic");
  const [cached, setCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [canRefresh, setCanRefresh] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [slow, setSlow] = useState(false);
  const _insightFeature = useAiFeature("insights");

  const fetchInsights = useCallback(
    async (forceGenerate = false) => {
      setLoading(true);
      setError(false);
      setSlow(false);

      const controller = new AbortController();
      const slowTimer = setTimeout(() => setSlow(true), 5000);
      const abortTimer = setTimeout(() => controller.abort(), 15000);

      try {
        if (!forceGenerate) {
          // Try cached first
          const cachedRes = await fetch(`/api/insights?page=${page}`, { signal: controller.signal });
          if (cachedRes.ok) {
            const data = await cachedRes.json();
            if (data.insights?.length > 0) {
              setInsights(data.insights);
              setCached(true);
              setCachedAt(data.cachedAt ?? null);
              setStale(data.stale ?? false);
              setCanRefresh(data.canRefresh ?? true);
              setLoading(false);
              clearTimeout(slowTimer);
              clearTimeout(abortTimer);
              return;
            }
          }
        }

        // Generate fresh insights
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, scenarioId, pageData }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Failed to generate insights");

        const data = await res.json();
        setInsights(data.insights ?? []);
        setCached(false);
        setCachedAt(null);
        setStale(false);
        setCanRefresh(true);
      } catch (err) {
        setError(true);
        setErrorVariant(classifyError(err));
        // Log error
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          captureException(err);
        }
      } finally {
        setLoading(false);
        setSlow(false);
        clearTimeout(slowTimer);
        clearTimeout(abortTimer);
      }
    },
    [page, scenarioId, pageData]
  );

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading && insights.length === 0) {
    return (
      <AiGate feature="insights" hideWhenOff>
        {slow ? (
          <div className="rounded-2xl border border-surface-200 bg-surface-0 p-4 mb-6 animate-slide-up">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-4 w-4 text-brand-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-surface-500">Generating insights — this may take a moment...</p>
            </div>
          </div>
        ) : (
          <InsightsSkeleton />
        )}
      </AiGate>
    );
  }

  if (error && insights.length === 0) {
    return (
      <AiGate feature="insights" hideWhenOff>
        <div className="mb-6">
          <DataLoadError
            title="Couldn't load insights"
            variant={errorVariant}
            onRetry={() => fetchInsights()}
            retrying={loading}
            compact
          />
        </div>
      </AiGate>
    );
  }

  if (insights.length === 0) return null;

  return (
    <AiGate feature="insights" hideWhenOff>
      <div className="rounded-2xl border border-surface-200 bg-surface-0 overflow-hidden mb-6 animate-slide-up">
        {/* Header */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-50/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-brand-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-surface-400">
              AI Insights
            </span>
            {cached && cachedAt && (
              <span className={`text-[10px] flex items-center gap-1 ${stale ? "text-warning-500" : "text-surface-300"}`}>
                {stale && <Clock className="h-2.5 w-2.5" />}
                {formatAge(cachedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Show refresh even in cached-only mode when stale */}
            {(canRefresh || (cached && stale)) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fetchInsights(true);
                }}
                disabled={loading || (!canRefresh && !stale)}
                className="rounded-md p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all disabled:opacity-50"
                title={canRefresh ? "Refresh insights" : "Cached mode — refresh unavailable"}
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-surface-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-surface-400" />
            )}
          </div>
        </div>

        {/* Staleness warning banner */}
        {stale && expanded && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-warning-500/20 bg-warning-50/50 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning-500 flex-shrink-0" />
            <p className="text-xs text-warning-700">
              These insights are over 24 hours old and may not reflect recent changes.
              {canRefresh && (
                <button
                  onClick={() => fetchInsights(true)}
                  disabled={loading}
                  className="ml-1 underline hover:no-underline font-medium"
                >
                  Refresh now
                </button>
              )}
            </p>
          </div>
        )}

        {/* Insights list */}
        {expanded && (
          <div className="px-4 pb-4 space-y-2">
            {insights.map((insight, i) => {
              const style = severityConfig[insight.severity];
              const Icon = typeIcons[insight.type] ?? TrendingUp;

              return (
                <div
                  key={`${insight.type}-${i}`}
                  className={`rounded-xl border ${style.border} ${style.bg} p-3.5 transition-all`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <Icon className={`h-4 w-4 ${style.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-900 leading-snug">
                        {insight.title}
                      </p>
                      <p className="text-xs text-surface-500 mt-1 leading-relaxed">
                        {insight.summary}
                      </p>
                    </div>
                    <div className={`flex-shrink-0 h-2 w-2 rounded-full mt-1.5 ${style.dot}`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AiGate>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div className="rounded-2xl border border-surface-200 bg-surface-0 p-4 mb-6 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-3.5 w-3.5 rounded bg-surface-200" />
        <div className="h-3 w-20 rounded bg-surface-200" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="rounded-xl border border-surface-100 bg-surface-50/50 p-3.5">
            <div className="flex items-start gap-3">
              <div className="h-4 w-4 rounded bg-surface-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-3/4 rounded bg-surface-200" />
                <div className="h-3 w-full rounded bg-surface-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
