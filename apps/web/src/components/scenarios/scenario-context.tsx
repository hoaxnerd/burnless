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

// Cross-tab notification key. Writing it to localStorage fires a `storage`
// event in every OTHER tab of this origin (never the writer), letting them
// re-reconcile their dual-channel state. The cookie is shared across tabs but
// emits no JS event on change, so we piggy-back this localStorage tick on every
// enter/exit to broadcast "the active scenario just changed — re-check".
export const SCENARIO_SYNC_KEY = "active-scenario-sync";

// Keep the cookie alive long enough that its ABSENCE is meaningful: a missing
// cookie means "the scenario was intentionally exited" (the authoritative
// signal reconcile relies on), not "the session cookie incidentally expired".
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Pure dual-channel reconcile decision. The cookie (`active-scenario-id`) is
 * SHARED across tabs; sessionStorage (`active-scenario`, the source of the
 * `X-Scenario-Id` header in apiFetch) is PER-TAB. The server rejects any
 * mutation where the two disagree, so they must be kept in lockstep.
 *
 * The cookie is the authority because it is the shared, cross-tab channel:
 *   - cookie present, session matches      → nothing to do
 *   - cookie present, session missing/stale → adopt the cookie (new/restored tab)
 *   - cookie ABSENT, session present        → another tab exited → drop the
 *                                             stale per-tab header source, else
 *                                             the next mutation sends a header
 *                                             with no cookie → 409 lock.
 *   - both absent                           → nothing to do
 */
export type ReconcileDecision =
  | { action: "none" }
  | { action: "clearSession" }
  | { action: "adoptCookie"; id: string };

export function decideReconcile(
  cookieId: string | null,
  storedId: string | null
): ReconcileDecision {
  if (cookieId) {
    if (storedId === cookieId) return { action: "none" };
    return { action: "adoptCookie", id: cookieId };
  }
  if (storedId) return { action: "clearSession" };
  return { action: "none" };
}

function broadcastScenarioSync() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SCENARIO_SYNC_KEY, String(Date.now()));
  } catch {
    // Storage disabled/full — other tabs still self-heal on focus/visibility.
  }
}

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
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Strict; Path=/`;
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

  // Reconcile the dual channels (cookie = shared/authority, sessionStorage =
  // per-tab header source) toward the cookie. Runs on mount AND on every signal
  // that the shared cookie might have changed under us: a cross-tab sync tick,
  // tab re-focus, or visibility change. Mount-only reconcile (the previous fix)
  // could not catch a cookie cleared by ANOTHER tab after this one had loaded —
  // that left sessionStorage populated with no cookie, so the next mutation
  // sent X-Scenario-Id without the cookie and got a 409 lock with no recovery.
  /* eslint-disable react-hooks/set-state-in-effect */
  const reconcile = useCallback(async () => {
    const cookieId = readCookie();
    const stored = readSessionStorage();
    const decision = decideReconcile(cookieId, stored?.id ?? null);

    if (decision.action === "none") {
      // Channels agree (or both empty) — mirror them into React state.
      setActiveScenarioId(stored?.id ?? null);
      setActiveScenarioName(stored?.name ?? null);
      return;
    }

    if (decision.action === "clearSession") {
      // Cookie gone (another tab exited). Drop this tab's stale header source so
      // apiFetch stops sending X-Scenario-Id without a cookie.
      clearSessionStorage();
      setActiveScenarioId(null);
      setActiveScenarioName(null);
      return;
    }

    // adoptCookie: the shared cookie names the active scenario; make this tab
    // match it. Reuse the cached name if we already have it, else fetch it.
    const { id } = decision;
    if (stored?.id === id) {
      setActiveScenarioId(id);
      setActiveScenarioName(stored.name);
      return;
    }
    try {
      const r = await fetch(`/api/scenarios/${id}`);
      if (r.ok) {
        const data = await r.json();
        if (data?.name) {
          writeSessionStorage(id, data.name);
          setActiveScenarioId(id);
          setActiveScenarioName(data.name);
          return;
        }
      }
      // Scenario gone (deleted, wrong company, etc.) — clear stale cookie +
      // session so the next mutation doesn't trip the dual-channel check.
      clearCookie();
      clearSessionStorage();
      setActiveScenarioId(null);
      setActiveScenarioName(null);
    } catch {
      // Network blip — leave state alone; a later focus/visibility tick retries.
    }
  }, []);

  useEffect(() => {
    void reconcile();

    const onStorage = (e: StorageEvent) => {
      // Cross-tab sync tick (or a full storage clear, key === null).
      if (e.key === SCENARIO_SYNC_KEY || e.key === null) void reconcile();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcile();
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reconcile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const enterScenario = useCallback(
    (id: string, name: string) => {
      setActiveScenarioId(id);
      setActiveScenarioName(name);
      // Channel 1: cookie (shared across tabs, auto-propagated to server)
      setCookie(id);
      // Channel 2: sessionStorage (per-tab, read by apiFetch for header)
      writeSessionStorage(id, name);
      // Tell other tabs to re-reconcile against the now-updated shared cookie.
      broadcastScenarioSync();
      router.refresh();
    },
    [router]
  );

  const exitScenario = useCallback(() => {
    clearCookie();
    clearSessionStorage();
    setActiveScenarioId(null);
    setActiveScenarioName(null);
    // Tell other tabs the shared cookie is gone so they drop their header source.
    broadcastScenarioSync();
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
