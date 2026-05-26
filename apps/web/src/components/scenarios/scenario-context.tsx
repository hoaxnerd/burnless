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

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === COOKIE_NAME && v) {
      try { return decodeURIComponent(v); } catch { return v; }
    }
  }
  return null;
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

  // Hydrate dual-channel state on mount. The cookie is the persistence
  // anchor (survives tab close); sessionStorage is the in-tab cache used
  // by apiFetch to inject X-Scenario-Id. If these get out of sync (e.g.
  // sessionStorage cleared but cookie still set), every mutation 409s
  // because the server's dual-channel check sees a cookie without a
  // matching header. Reconcile here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = readSessionStorage();
    const cookieId = readCookie();

    // Fast path: sessionStorage has it — trust it, sync cookie.
    if (stored) {
      setActiveScenarioId(stored.id);
      setActiveScenarioName(stored.name);
      setCookie(stored.id);
      return;
    }

    // Cookie-only path: rehydrate name from API, or clear if stale.
    if (cookieId) {
      let cancelled = false;
      fetch(`/api/scenarios/${cookieId}`)
        .then(async (r) => {
          if (cancelled) return;
          if (r.ok) {
            const data = await r.json();
            if (data?.name) {
              setActiveScenarioId(cookieId);
              setActiveScenarioName(data.name);
              writeSessionStorage(cookieId, data.name);
              return;
            }
          }
          // Scenario gone (deleted, wrong company, etc.) — clear stale cookie
          // so the next mutation doesn't trip the dual-channel safety check.
          clearCookie();
        })
        .catch(() => {
          // Network blip — leave state alone; user can retry by reloading.
        });
      return () => { cancelled = true; };
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
