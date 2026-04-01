"use client";

import Link from "next/link";
import { useState } from "react";
import { GitBranch, Play, Square, BarChart3 } from "lucide-react";
import { useScenario } from "@/components/scenarios/scenario-context";

interface ScenarioItem {
  id: string;
  name: string;
  description: string | null;
  source: string;
  status: string;
  color: string | null;
  createdAt: string;
}

export function ScenarioCards({ scenarios }: { scenarios: ScenarioItem[] }) {
  const { activeScenarioId, enterScenario, exitScenario } = useScenario();
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  if (scenarios.length === 0) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <div className="mx-auto max-w-md">
          <div className="text-4xl mb-4">
            <GitBranch className="h-12 w-12 mx-auto text-surface-300" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">
            No scenarios yet
          </h3>
          <p className="text-sm text-surface-500 mb-6">
            Create your first scenario to start modeling different outcomes for
            your business — best case, worst case, and everything in between.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Compare bar */}
      {compareIds.length >= 2 && (
        <div className="mb-6 rounded-lg bg-brand-50 border border-brand-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-brand-800">
              {compareIds.length} scenarios selected for comparison
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCompareIds([])}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Clear
            </button>
            <Link
              href={`/scenarios/compare?ids=${compareIds.join(",")}`}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Compare scenarios
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {scenarios.map((scenario) => {
          const isActive = activeScenarioId === scenario.id;
          const isComparing = compareIds.includes(scenario.id);

          return (
            <div
              key={scenario.id}
              className={`rounded-xl bg-surface-0 border p-6 transition-all ${
                isActive
                  ? "border-amber-400 shadow-sm ring-1 ring-amber-200"
                  : isComparing
                  ? "border-brand-300 shadow-sm ring-1 ring-brand-200"
                  : "border-surface-200 hover:border-brand-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-surface-900">
                    {scenario.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-block rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-600">
                      {scenario.source}
                    </span>
                    {scenario.status === "promoted" && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        Promoted
                      </span>
                    )}
                    {scenario.status === "archived" && (
                      <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-500">
                        Archived
                      </span>
                    )}
                  </div>
                </div>
                {isActive && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Active
                  </span>
                )}
              </div>

              {scenario.description && (
                <p className="mt-2 text-xs text-surface-500">
                  {scenario.description}
                </p>
              )}

              <p className="mt-3 text-xs text-surface-400">
                Created {new Date(scenario.createdAt).toLocaleDateString()}
              </p>

              {/* Actions */}
              <div className="mt-4 flex items-center gap-2">
                {isActive ? (
                  <button
                    onClick={exitScenario}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-200 transition-colors"
                  >
                    <Square className="h-3 w-3" />
                    Exit sandbox
                  </button>
                ) : (
                  <button
                    onClick={() => enterScenario(scenario.id, scenario.name)}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    Enter sandbox
                  </button>
                )}

                <button
                  onClick={() => toggleCompare(scenario.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isComparing
                      ? "bg-brand-100 text-brand-700 hover:bg-brand-200"
                      : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                  }`}
                >
                  <BarChart3 className="h-3 w-3" />
                  {isComparing ? "Selected" : "Compare"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
