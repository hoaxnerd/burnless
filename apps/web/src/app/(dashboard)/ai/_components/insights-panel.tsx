"use client";

import { useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import type { Insight } from "./types";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";

function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <TrendingUp className="h-4 w-4 text-accent-500" />;
  }
}

function severityBorder(severity: string) {
  switch (severity) {
    case "critical":
      return "border-red-200 bg-red-50";
    case "warning":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-accent-200 bg-accent-50";
  }
}

interface InsightsPanelProps {
  insights: Insight[];
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const [open, setOpen] = useState(true);

  if (insights.length === 0) return null;

  // Collapsed state — show a toggle button on the right edge
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden lg:flex items-center gap-1 self-start rounded-l-lg border border-r-0 border-surface-200 bg-surface-0 px-2 py-3 text-surface-500 hover:text-surface-700 hover:bg-surface-50 transition-colors"
        title="Show insights"
      >
        <ChevronLeft className="h-4 w-4" />
        <Lightbulb className="h-4 w-4 text-amber-500" />
      </button>
    );
  }

  return (
    <>
      {/* Desktop: side panel */}
      <div className="hidden lg:flex flex-col w-80 flex-shrink-0 overflow-hidden rounded-2xl border border-surface-200 bg-surface-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
          <h2 className="text-sm font-semibold text-surface-700 flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Insights & Alerts
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
            title="Collapse panel"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      </div>

      {/* Mobile: collapsible section below chat (not overlay) */}
      <MobileInsights insights={insights} />
    </>
  );
}

function MobileInsights({ insights }: { insights: Insight[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="lg:hidden border-t border-surface-200 bg-surface-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-surface-700"
      >
        <span className="flex items-center gap-1.5">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Insights ({insights.length})
        </span>
        {expanded ? (
          <X className="h-4 w-4 text-surface-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-surface-400 rotate-90" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2 max-h-60 overflow-auto">
          {insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`rounded-xl border p-3 ${severityBorder(insight.severity)}`}>
      <div className="flex items-start gap-2">
        {severityIcon(insight.severity)}
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-surface-900">
            {insight.title}
          </h3>
          <MarkdownRenderer
            content={insight.summary}
            variant="compact"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
