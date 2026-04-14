"use client";

import {
  AlertTriangle,
  TrendingUp,
  Lightbulb,
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

/** Mobile insights card — parent controls visibility */
export function InsightsPanel({ insights }: InsightsPanelProps) {
  if (insights.length === 0) return null;

  return (
    <div className="lg:hidden mx-2 mb-3 rounded-xl border border-surface-200 bg-surface-0 shadow-sm">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-surface-100">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold text-surface-700">
          Insights ({insights.length})
        </span>
      </div>
      <div className="px-4 pb-3 pt-2 space-y-2 max-h-60 overflow-auto">
        {insights.map((insight, i) => (
          <InsightCard key={i} insight={insight} />
        ))}
      </div>
    </div>
  );
}

export function InsightCard({ insight }: { insight: Insight }) {
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
