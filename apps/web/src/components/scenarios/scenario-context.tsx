"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface ScenarioContextValue {
  activeScenarioId: string | null;
  activeScenarioName: string | null;
  isInScenarioMode: boolean;
  enterScenario: (id: string, name: string) => void;
  exitScenario: () => void;
}

const STORAGE_KEY = "active-scenario";
const COOKIE_NAME = "active-scenario-id";

function readSessionStorage(): { id: string; name: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.name) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeSessionStorage(id: string, name: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
}

function clearSessionStorage() {
  sessionStorage.removeItem(STORAGE_KEY);
}

function setCookie(id: string) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; SameSite=Strict; Path=/`;
}

function clearCookie() {
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0`;
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

  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [activeScenarioName, setActiveScenarioName] = useState<string | null>(null);

  // Hydrate from sessionStorage on mount (survives refresh)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = readSessionStorage();
    if (stored) {
      setActiveScenarioId(stored.id);
      setActiveScenarioName(stored.name);
      // Ensure cookie is in sync (may have expired)
      setCookie(stored.id);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const enterScenario = useCallback(
    (id: string, name: string) => {
      setActiveScenarioId(id);
      setActiveScenarioName(name);
      // Channel 1: cookie (auto-propagated to server)
      setCookie(id);
      // Channel 2: sessionStorage (read by apiFetch for header)
      writeSessionStorage(id, name);
      router.refresh();
    },
    [router]
  );

  const exitScenario = useCallback(() => {
    clearCookie();
    clearSessionStorage();
    setActiveScenarioId(null);
    setActiveScenarioName(null);
    router.refresh();
  }, [router]);

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
