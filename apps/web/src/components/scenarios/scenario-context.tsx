"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface ScenarioContextValue {
  /** ID of the active scenario, null = base/default */
  activeScenarioId: string | null;
  /** Name of the active scenario for display */
  activeScenarioName: string | null;
  /** Whether we're in scenario sandbox mode */
  isInScenarioMode: boolean;
  /** Enter a scenario sandbox — updates URL across all pages */
  enterScenario: (id: string, name: string) => void;
  /** Exit scenario sandbox and return to base data */
  exitScenario: () => void;
}

const ScenarioContext = createContext<ScenarioContextValue>({
  activeScenarioId: null,
  activeScenarioName: null,
  isInScenarioMode: false,
  enterScenario: () => {},
  exitScenario: () => {},
});

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlScenarioId = searchParams.get("scenarioId");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(urlScenarioId);
  const [activeScenarioName, setActiveScenarioName] = useState<string | null>(null);

  // Sync state when URL changes externally
  useEffect(() => {
    if (urlScenarioId !== activeScenarioId) {
      setActiveScenarioId(urlScenarioId); // eslint-disable-line react-hooks/set-state-in-effect -- sync URL params to state
      if (!urlScenarioId) setActiveScenarioName(null); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [urlScenarioId, activeScenarioId]);

  const enterScenario = useCallback(
    (id: string, name: string) => {
      setActiveScenarioId(id);
      setActiveScenarioName(name);
      const params = new URLSearchParams(searchParams.toString());
      params.set("scenarioId", id);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const exitScenario = useCallback(() => {
    setActiveScenarioId(null);
    setActiveScenarioName(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("scenarioId");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  return (
    <ScenarioContext.Provider
      value={{
        activeScenarioId,
        activeScenarioName,
        isInScenarioMode: activeScenarioId !== null,
        enterScenario,
        exitScenario,
      }}
    >
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  return useContext(ScenarioContext);
}
