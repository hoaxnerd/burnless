"use client";

import { AlertTriangle, X, ArrowLeftRight, ArrowUpCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { useScenario } from "./scenario-context";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function ScenarioBanner() {
  const { isInScenarioMode, activeScenarioId, activeScenarioName, exitScenario } = useScenario();
  const [fetchedName, setFetchedName] = useState<string | undefined>(undefined);
  const [fetchedCount, setFetchedCount] = useState<number | null>(null);
  const router = useRouter();

  // Derive display name: prefer context name, fall back to fetched name
  const resolvedName = activeScenarioName ?? fetchedName;

  // Derive override count: only valid when there is an active scenario
  const overrideCount = activeScenarioId ? fetchedCount : null;

  // If we have an ID but no name (e.g., direct URL navigation), fetch it
  useEffect(() => {
    if (!activeScenarioId || activeScenarioName) return;
    let cancelled = false;
    apiFetch(`/api/scenarios/${activeScenarioId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.name) setFetchedName(data.name);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeScenarioId, activeScenarioName]);

  // Fetch live override count
  useEffect(() => {
    if (!activeScenarioId) return;

    let cancelled = false;

    apiFetch(`/api/scenarios/overrides?scenarioId=${activeScenarioId}&count=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.count === "number") {
          setFetchedCount(data.count);
        }
      })
      .catch(() => {
        // Endpoint may not exist yet — leave count as null
      });

    return () => {
      cancelled = true;
    };
  }, [activeScenarioId]);

  if (!isInScenarioMode) return null;

  // Page reads `ids` (comma-separated). First id = base side, second = compare side.
  // Use literal "base" for the current plan; comparison-view has a matching option.
  const compareUrl = `/scenarios/compare?ids=base,${activeScenarioId}`;
  const changeLabel =
    overrideCount !== null
      ? `${overrideCount} change${overrideCount !== 1 ? "s" : ""} from base`
      : "\u2014 changes";

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          SCENARIO: {resolvedName ?? "Loading..."}
        </span>
        <span className="text-white/60 text-sm hidden sm:inline">|</span>
        <button
          onClick={() => router.push(compareUrl)}
          className="text-sm text-white/80 hover:text-white underline underline-offset-2 decoration-white/40 hover:decoration-white transition-colors hidden sm:inline"
        >
          {changeLabel}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
          onClick={() => router.push(compareUrl)}
          className="!text-white bg-white/15 hover:!bg-white/25 active:!bg-white/30 border-0"
        >
          Compare with Base
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
          onClick={() => router.push(`/scenarios?promote=${activeScenarioId}`)}
          className="!text-white bg-white/15 hover:!bg-white/25 active:!bg-white/30 border-0"
        >
          Promote to Base
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={exitScenario}
          className="!text-white bg-white/20 hover:!bg-white/30 active:!bg-white/35 border-0"
        >
          Exit
        </Button>
      </div>
    </div>
  );
}
