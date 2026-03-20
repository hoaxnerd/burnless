"use client";

import { AlertTriangle, X } from "lucide-react";
import { useScenario } from "./scenario-context";

export function ScenarioBanner() {
  const { isInScenarioMode, activeScenarioName, exitScenario } = useScenario();

  if (!isInScenarioMode) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">
          SCENARIO MODE: {activeScenarioName} &mdash; changes don&apos;t affect base data
        </span>
      </div>
      <button
        onClick={exitScenario}
        className="flex items-center gap-1 rounded-md bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 transition-colors"
      >
        <X className="h-3 w-3" />
        Exit Scenario
      </button>
    </div>
  );
}
