"use client";

import { AiPageInsights } from "@/components/ai/ai-page-insights";

interface ScenarioItem {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
}

export function ScenarioInsightsWrapper({
  scenarios,
}: {
  scenarios: ScenarioItem[];
}) {
  const defaultScenario = scenarios.find((s) => s.isDefault) ?? scenarios[0];
  if (!defaultScenario) return null;

  return (
    <AiPageInsights
      page="scenarios"
      scenarioId={defaultScenario.id}
    />
  );
}
