"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  TrendingUp,
  ShieldAlert,
  BarChart3,
  GraduationCap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  ArrowUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AiGate } from "./ai-gate";
import { useAiFeature, useAiFlags } from "./ai-feature-context";
import { useOptionalPageLayout } from "@/components/providers/page-layout-context";
import { DataLoadError } from "@/components/ui/data-load-error";
import { MarkdownRenderer } from "./markdown-renderer";
import { useInsightCache } from "./use-insight-cache";
import { StaleInsightBanner } from "./stale-insight-banner";

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
  continuationPrompt?: string;
}

interface AiPageInsightsProps {
  /** Which page these insights are for */
  page: "dashboard" | "expenses" | "revenue" | "scenarios" | "funding" | "team" | "reports";
  /** Scenario ID for context (optional for non-scenario pages like funding, team, reports) */
  scenarioId?: string;
  /** Additional page-specific data to send to the API */
  pageData?: Record<string, unknown>;
  /** Widget ID for grid readiness reporting (default: "ai-insights") */
  widgetId?: string;
  /** Show a chat input below insights (only used on dashboard) */
  showChatInput?: boolean;
}

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

export function AiPageInsights({ page, scenarioId, pageData, widgetId = "ai-insights", showChatInput }: AiPageInsightsProps) {
  const { enabled, loaded } = useAiFeature("insights");
  const { budget } = useAiFlags();
  const isBudgetExceeded = budget?.exceeded ?? false;
  const cache = useInsightCache<PageInsight>({ page, scenarioId, pageData, aiEnabled: loaded && enabled, budgetExceeded: isBudgetExceeded });
  const [expanded, setExpanded] = useState(true);
  const pageLayout = useOptionalPageLayout();
  const router = useRouter();

  // Report readiness to the grid: ready when AI is enabled AND we have data to show.
  // Stay ready during refresh if we have stale data (stale-while-revalidate).
  // Don't report not-ready while still settling (initial fetch + auto-generate).
  const hasData = cache.displayData.length > 0;
  const isReady = loaded && enabled && hasData;
  const reportReady = pageLayout?.reportWidgetReady;
  const reportNotReady = pageLayout?.reportWidgetNotReady;
  useEffect(() => {
    if (!loaded) return;
    if (isReady) {
      reportReady?.(widgetId);
    } else if (!cache.settling) {
      reportNotReady?.(widgetId);
    }
  }, [isReady, loaded, cache.settling, widgetId, reportReady, reportNotReady]);

  // Pure loading with no previous data — show skeleton
  if (cache.settling && cache.displayData.length === 0) {
    return (
      <AiGate feature="insights" hideWhenOff>
        {cache.slow ? (
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

  if (cache.error && cache.displayData.length === 0) {
    return (
      <AiGate feature="insights" hideWhenOff>
        <div className="mb-6">
          <DataLoadError
            title={isBudgetExceeded ? "AI budget exceeded" : "Couldn't load insights"}
            message={isBudgetExceeded ? "Your monthly AI budget has been reached. Adjust your budget in Settings to continue generating insights." : undefined}
            variant={cache.errorVariant}
            onRetry={isBudgetExceeded ? undefined : () => cache.fetchCached()}
            retrying={cache.loading}
            compact
          />
        </div>
      </AiGate>
    );
  }

  if (cache.displayData.length === 0) return null;

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
            {cache.cached && cache.cachedAt && (
              <span className={`text-[10px] flex items-center gap-1 ${cache.stale ? "text-warning-500" : "text-surface-300"}`}>
                {cache.stale && <Clock className="h-2.5 w-2.5" />}
                {formatAge(cache.cachedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {cache.canRefresh && !cache.budgetExceeded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cache.refresh();
                }}
                disabled={cache.loading}
                className="rounded-md p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all disabled:opacity-50"
                title="Refresh insights"
              >
                <RefreshCw className={`h-3 w-3 ${cache.loading ? "animate-spin" : ""}`} />
              </button>
            )}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-surface-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-surface-400" />
            )}
          </div>
        </div>

        {/* Refresh error banner — shown when refresh failed but stale data is visible */}
        {expanded && cache.refreshError && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-danger-500/20 bg-danger-50/50 px-3 py-2">
            <Info className="h-3.5 w-3.5 text-danger-500 flex-shrink-0" />
            <p className="text-xs text-danger-700">
              {isBudgetExceeded
                ? "AI budget exceeded. Showing previously generated insights."
                : <>
                    Failed to refresh insights. Showing previous version.
                    <button
                      onClick={() => cache.refresh()}
                      disabled={cache.loading}
                      className="ml-1 underline hover:no-underline font-medium"
                    >
                      Try again
                    </button>
                  </>
              }
            </p>
          </div>
        )}

        {/* Staleness banners */}
        {expanded && !cache.refreshError && (
          <div className="mx-4 mb-2">
            <StaleInsightBanner
              stale={cache.stale}
              dataChanged={cache.dataChanged}
              graceRemaining={cache.graceRemaining}
              staleReason={cache.staleReason}
              canRefresh={cache.canRefresh}
              loading={cache.loading}
              onRefresh={cache.refresh}
            />
          </div>
        )}

        {/* Insights list */}
        {expanded && (
          <div className={`px-4 pb-4 space-y-2 transition-opacity ${cache.loading ? "opacity-60" : ""}`}>
            {cache.displayData.map((insight, i) => {
              const style = severityConfig[insight.severity];
              const Icon = typeIcons[insight.type] ?? TrendingUp;

              const isStale = cache.stale && (cache.dataChanged || cache.staleReason);

              const prompt = insight.continuationPrompt || `Tell me more about: ${insight.title}`;
              const handleClick = () => router.push(`/ai?prompt=${encodeURIComponent(prompt)}`);

              return (
                <div
                  key={`${insight.type}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
                  className={`rounded-xl border ${isStale ? "border-warning-500/30" : style.border} ${isStale ? "bg-warning-50/20" : style.bg} p-3.5 transition-all cursor-pointer hover:shadow-sm hover:brightness-[0.98]`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <Icon className={`h-4 w-4 ${isStale ? "text-warning-400" : style.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-900 leading-snug">
                        {insight.title}
                      </p>
                      <MarkdownRenderer
                        content={insight.summary}
                        variant="compact"
                        className="mt-1"
                      />
                    </div>
                    {isStale ? (
                      <div className="flex-shrink-0 mt-0.5" title={cache.staleReason && STALE_REASON_LABELS[cache.staleReason] ? `Data changed: ${STALE_REASON_LABELS[cache.staleReason]}` : "Data may have changed since this insight was generated"}>
                        <Info className="h-3.5 w-3.5 text-warning-400" />
                      </div>
                    ) : (
                      <div className={`flex-shrink-0 h-2 w-2 rounded-full mt-1.5 ${style.dot}`} />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Chat input — dashboard only */}
            {showChatInput && (
              <div className="pt-2">
                <ChatInputInline />
              </div>
            )}
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

// ── Inline chat input (navigates to AI chat page) ──────────────────────────

function ChatInputInline() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/ai?send=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-50/80 px-3 py-2.5 transition-all focus-within:border-brand-500/40 focus-within:ring-2 focus-within:ring-brand-500/10">
      <Sparkles className="h-3.5 w-3.5 text-surface-400 shrink-0" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
        placeholder="Ask anything about your financials..."
        className="flex-1 bg-transparent text-sm text-surface-900 placeholder:text-surface-400 outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={!query.trim()}
        className="shrink-0 rounded-lg bg-brand-600 p-1.5 text-white hover:bg-brand-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Ask"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
