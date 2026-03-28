"use client";

import { Sparkles, X, Pin } from "lucide-react";
import { usePinnedInsights } from "@/components/ai/use-pinned-insights";
import { useOptionalAiFlags } from "@/components/ai/ai-feature-context";

export function PinnedInsights() {
  const { pins, unpin } = usePinnedInsights();
  const aiFlags = useOptionalAiFlags();
  const companionName = aiFlags?.companionName ?? "Companion";

  if (pins.length === 0) return null;

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-5 sm:p-6 animate-slide-up">
      <div className="flex items-center gap-2 mb-4">
        <Pin className="h-3.5 w-3.5 text-brand-500" />
        <h2 className="text-sm font-semibold text-surface-900">Pinned Insights</h2>
        <span className="text-[10px] text-surface-400">from {companionName}</span>
      </div>
      <div className="space-y-2">
        {pins.map((insight) => (
          <div
            key={insight.id}
            className="group relative rounded-xl border border-surface-100 bg-surface-50/50 p-3.5 hover:border-brand-200 hover:bg-brand-50/20 transition-all"
          >
            <div className="flex items-start gap-2.5">
              <div className="flex-shrink-0 mt-0.5">
                <Sparkles className="h-3 w-3 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-surface-700 leading-relaxed line-clamp-3">
                  {insight.content}
                </p>
                <p className="mt-1.5 text-[10px] text-surface-400">
                  {insight.page} &middot;{" "}
                  {new Date(insight.pinnedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => unpin(insight.id)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 rounded-md p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all"
                title="Unpin insight"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
