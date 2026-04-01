"use client";

import { AiPageInsights } from "@/components/ai/ai-page-insights";

interface ScenarioItem {
  id: string;
  name: string;
}

export function ScenarioInsightsWrapper({
  scenarios,
}: {
  scenarios: ScenarioItem[];
}) {
  // In the overlay model there's no "default" scenario — just use the first one for insights context
  const firstScenario = scenarios[0];
  if (!firstScenario) return null;

  return (
    <AiPageInsights
      page="scenarios"
      scenarioId={firstScenario.id}
    />
  );
}
