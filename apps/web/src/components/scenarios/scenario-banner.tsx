"use client";

import { AlertTriangle, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { useScenario } from "./scenario-context";
import { useEffect, useState } from "react";

export function ScenarioBanner() {
  const { isInScenarioMode, activeScenarioId, activeScenarioName, exitScenario } = useScenario();
  const [resolvedName, setResolvedName] = useState(activeScenarioName);

  // If we have an ID but no name (e.g., direct URL navigation), fetch it
  useEffect(() => {
    if (activeScenarioId && !activeScenarioName) {
      apiFetch(`/api/scenarios/${activeScenarioId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.name) setResolvedName(data.name);
        })
        .catch(() => {});
    } else {
      setResolvedName(activeScenarioName); // eslint-disable-line react-hooks/set-state-in-effect -- sync derived state from context
    }
  }, [activeScenarioId, activeScenarioName]);

  if (!isInScenarioMode) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">
          SCENARIO MODE: {resolvedName ?? "Loading..."} &mdash; changes don&apos;t affect base data
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
