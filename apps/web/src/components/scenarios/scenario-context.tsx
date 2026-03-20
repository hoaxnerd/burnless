"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ScenarioContextValue {
  /** ID of the active scenario, null = base/default */
  activeScenarioId: string | null;
  /** Name of the active scenario for display */
  activeScenarioName: string | null;
  /** Whether we're in scenario sandbox mode */
  isInScenarioMode: boolean;
  /** Enter a scenario sandbox */
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
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [activeScenarioName, setActiveScenarioName] = useState<string | null>(null);

  const enterScenario = useCallback((id: string, name: string) => {
    setActiveScenarioId(id);
    setActiveScenarioName(name);
  }, []);

  const exitScenario = useCallback(() => {
    setActiveScenarioId(null);
    setActiveScenarioName(null);
  }, []);

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
