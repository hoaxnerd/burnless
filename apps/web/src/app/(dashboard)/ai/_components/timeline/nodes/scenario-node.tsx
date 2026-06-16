// apps/web/src/app/(dashboard)/ai/_components/timeline/nodes/scenario-node.tsx
"use client";
import { GitBranch, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScenario } from "@/components/scenarios/scenario-context";
import type { TimelineNodeClient } from "../../types";

/** Worklog marker for a scenario the AI created or activated (Plan 5). The active
 *  scenario shows an "Active" badge; any other shows an Enter button that runs the
 *  real enterScenario (top bar) — so multi-scenario chats can re-enter a prior one. */
export function ScenarioNode({ node }: { node: TimelineNodeClient }) {
  const { activeScenarioId, enterScenario } = useScenario();
  // An exit marker carries no scenarioId/name — render a simple "Exited scenario" line.
  if (!node.scenarioId) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-50/60 px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-surface-500" />
        <span className="truncate text-sm text-surface-700">Exited scenario</span>
      </div>
    );
  }
  const isActive = activeScenarioId === node.scenarioId;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-accent-200 bg-accent-50/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-accent-600" />
        <span className="truncate text-sm text-surface-800">
          Activated scenario <span className="font-semibold">{node.scenarioName ?? "scenario"}</span>
        </span>
      </div>
      {isActive ? (
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-success-50 px-1.5 py-0.5 text-[11px] font-medium text-success-600">
          <Check className="h-3 w-3" /> Active
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => node.scenarioId && enterScenario(node.scenarioId, node.scenarioName ?? "Scenario")}
        >
          Enter
        </Button>
      )}
    </div>
  );
}
