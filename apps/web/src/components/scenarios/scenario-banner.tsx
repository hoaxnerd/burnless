"use client";

import { useTransition } from "react";
import { AlertTriangle, X, ArrowLeftRight, ArrowUpCircle } from "lucide-react";
import { useScenario } from "./scenario-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useScenario as useScenarioSWR, useOverrideCount } from "@/lib/swr";

export function ScenarioBanner() {
  const { isInScenarioMode, activeScenarioId, activeScenarioName, exitScenario } = useScenario();
  const router = useRouter();

  // SCN-08: the /scenarios/compare RSC is force-dynamic + slow, so the button
  // reads as dead. Wrap the navigation in a transition and drive the Button's
  // pending state from isPending so the user sees a spinner immediately.
  const [isComparePending, startCompareTransition] = useTransition();

  // If we have an ID but no name (e.g. direct URL navigation), read it from the
  // shared SWR cache rather than a private snapshot fetch — only when the context
  // didn't already supply a name.
  const { data: fetchedScenario } = useScenarioSWR(
    activeScenarioId && !activeScenarioName ? activeScenarioId : null,
  );

  // Live override count via the shared SWR cache (SCN-05). Keyed on the scenario
  // id, so a delete/add of an override on any surface revalidates this badge
  // (KEYS.scenarioOverrideCount) without a reload.
  const { data: countData } = useOverrideCount(activeScenarioId ?? null);

  // Derive display name: prefer context name, fall back to fetched name
  const resolvedName = activeScenarioName ?? fetchedScenario?.name;

  // Derive override count: only valid when there is an active scenario
  const overrideCount =
    activeScenarioId && typeof countData?.count === "number" ? countData.count : null;

  if (!isInScenarioMode) return null;

  // Page reads `ids` (comma-separated). First id = base side, second = compare side.
  // Use literal "base" for the current plan; comparison-view has a matching option.
  const compareUrl = `/scenarios/compare?ids=base,${activeScenarioId}`;
  const goToCompare = () =>
    startCompareTransition(() => router.push(compareUrl));
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
          onClick={goToCompare}
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
          state={isComparePending ? "loading" : "idle"}
          onClick={goToCompare}
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
