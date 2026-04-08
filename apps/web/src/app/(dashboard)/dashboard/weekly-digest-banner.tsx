"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { captureException } from "@/lib/error-reporting";
import { X, Sparkles, Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePageLayoutContext } from "@/components/providers/page-layout-context";
import { useAiFeature } from "@/components/ai/ai-feature-context";

interface DigestData {
  id: string;
  narrative: string | null;
  deterministicSummary: string;
  metrics: Record<string, unknown>;
  weekStart: string;
}

export function WeeklyDigestBanner() {
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const { enabled: aiEnabled, loaded: aiLoaded } = useAiFeature("weeklyDigest");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    apiFetch("/api/digest", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.digest) setDigest(data.digest);
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          captureException(err);
        }
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const { reportWidgetReady, reportWidgetNotReady } = usePageLayoutContext();

  // Report readiness to the grid
  const isReady = !dismissed && !loading && !!digest;
  useEffect(() => {
    if (loading) return; // Don't report until fetch completes
    if (isReady) {
      reportWidgetReady("weekly-digest");
    } else {
      reportWidgetNotReady("weekly-digest");
    }
  }, [isReady, loading, reportWidgetReady, reportWidgetNotReady]);

  // Nothing to show yet, dismissed, or flags still loading
  if (!digest || dismissed || !aiLoaded) return null;

  // Only use AI narrative when AI is enabled; otherwise show deterministic summary
  const content = aiEnabled && digest.narrative
    ? digest.narrative
    : digest.deterministicSummary;
  const isAI = aiEnabled && !!digest.narrative;
  const weekDate = new Date(digest.weekStart).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const preview =
    content.length > 200 ? content.slice(0, 200) + "..." : content;

  async function handleDismiss() {
    setDismissed(true);
    try {
      await apiFetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", digestId: digest!.id }),
      });
    } catch {
      // Non-critical
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-r from-brand-50/50 via-surface-0 to-surface-0 p-4 sm:p-5 h-full animate-slide-up">
      {/* Ambient glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-500/5 via-transparent to-transparent opacity-50 pointer-events-none" />

      <div className="relative">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 rounded-xl bg-brand-500/10 p-2">
              <Calendar className="h-4 w-4 text-brand-500" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-surface-900">
                Monday Morning CFO
              </h3>
              <span className="text-[10px] text-surface-400 font-medium">
                Week of {weekDate}
              </span>
            </div>
            {isAI && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 px-2 py-0.5 text-[10px] font-medium text-accent-500">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 rounded-lg p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
            aria-label="Dismiss digest"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="text-sm text-surface-600 leading-relaxed whitespace-pre-wrap">
          {expanded ? content : preview}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-3">
          {content.length > 200 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
            >
              {expanded ? "Show less" : "Read full briefing"}
            </button>
          )}
          <Link
            href="/ai"
            className="inline-flex items-center gap-1 text-xs font-medium text-surface-400 hover:text-brand-500 transition-colors"
          >
            Ask follow-up <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
