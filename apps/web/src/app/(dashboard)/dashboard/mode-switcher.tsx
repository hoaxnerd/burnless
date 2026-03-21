"use client";

/**
 * Dashboard Mode Switcher — toggles between Intelligence, Dynamic, and Custom modes.
 * Shows as a segmented control in the dashboard header.
 */

import { Brain, Zap, SlidersHorizontal, Loader2 } from "lucide-react";
import { useDashboardIntelligence, type DashboardMode } from "./dashboard-intelligence-context";
import { useAiFlags } from "@/components/ai/ai-feature-context";

const modes: Array<{
  value: DashboardMode;
  label: string;
  shortLabel: string;
  icon: typeof Brain;
  description: string;
}> = [
  {
    value: "intelligence",
    label: "Intelligence",
    shortLabel: "AI",
    icon: Brain,
    description: "AI decides what to show",
  },
  {
    value: "dynamic",
    label: "Dynamic",
    shortLabel: "Auto",
    icon: Zap,
    description: "Data-driven defaults",
  },
  {
    value: "custom",
    label: "Custom",
    shortLabel: "Custom",
    icon: SlidersHorizontal,
    description: "Your configuration",
  },
];

export function ModeSwitcher() {
  const { mode, setMode, isSaving } = useDashboardIntelligence();
  const { masterEnabled: aiEnabled } = useAiFlags();

  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-surface-100 p-1 border border-surface-200">
      {modes.map((m) => {
        const Icon = m.icon;
        const isActive = mode === m.value;
        const isDisabled = m.value === "intelligence" && !aiEnabled;

        return (
          <button
            key={m.value}
            onClick={() => !isDisabled && setMode(m.value)}
            disabled={isDisabled}
            title={isDisabled ? "Enable AI to use Intelligence mode" : m.description}
            className={`
              relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              transition-all duration-200
              ${
                isActive && m.value === "intelligence"
                  ? "bg-surface-0 text-accent-700 shadow-sm"
                  : isActive
                  ? "bg-surface-0 text-surface-900 shadow-sm"
                  : isDisabled
                    ? "text-surface-300 cursor-not-allowed"
                    : "text-surface-500 hover:text-surface-700 hover:bg-surface-50"
              }
            `}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{m.label}</span>
            <span className="sm:hidden">{m.shortLabel}</span>
            {isActive && isSaving && (
              <Loader2 className="h-3 w-3 animate-spin text-surface-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}
