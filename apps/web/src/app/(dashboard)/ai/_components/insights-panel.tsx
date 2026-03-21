import { AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";
import type { Insight } from "./types";

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
  if (insights.length === 0) return null;

  return (
    <div className="hidden lg:block w-80 flex-shrink-0 overflow-auto">
      <h2 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-1.5">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        Insights & Alerts
      </h2>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 ${severityBorder(insight.severity)}`}
          >
            <div className="flex items-start gap-2">
              {severityIcon(insight.severity)}
              <div>
                <h3 className="text-sm font-medium text-surface-900">
                  {insight.title}
                </h3>
                <p className="mt-1 text-xs text-surface-600 leading-relaxed">
                  {insight.summary}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
