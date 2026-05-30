/**
 * Cross-tab "data changed" pub/sub. The SINGLE backbone for live freshness.
 *
 * Same tab: dispatched synchronously to subscribers.
 * Cross tab: a localStorage tick fires a `storage` event in OTHER tabs (never the
 * writer), which re-dispatches the event tagged { crossTab: true }. This matches the
 * existing scenario-sync pattern in scenario-context.tsx (one cross-tab mechanism, not
 * two). SSR-safe: all window/localStorage access is typeof-guarded.
 */

export interface MutationEvent {
  domain: string;   // "expenses" | "team" | "revenue" | "funding" | "scenario" | "other"
  method: string;   // POST | PATCH | PUT | DELETE
  at: number;       // Date.now() at publish
  crossTab?: boolean;
}

export const MUTATION_SYNC_KEY = "burnless-mutation-sync";

type Handler = (e: MutationEvent) => void;
const handlers = new Set<Handler>();
let storageBound = false;

function bindStorage() {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== MUTATION_SYNC_KEY || !e.newValue) return;
    try {
      const evt = JSON.parse(e.newValue) as MutationEvent;
      dispatch({ ...evt, crossTab: true });
    } catch {
      // ignore malformed payloads
    }
  });
}

function dispatch(e: MutationEvent) {
  for (const h of handlers) {
    try { h(e); } catch { /* isolate one bad subscriber */ }
  }
}

export function subscribeMutation(handler: Handler): () => void {
  bindStorage();
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function publishMutation(evt: MutationEvent): void {
  dispatch({ ...evt });
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MUTATION_SYNC_KEY, JSON.stringify(evt));
  } catch {
    // storage full/disabled — same-tab dispatch already happened
  }
}

export function domainFromUrl(url: string): string {
  if (url.includes("/forecast-lines") || url.includes("/transactions")) return "expenses";
  if (url.includes("/headcount")) return "team";
  if (url.includes("/revenue-streams")) return "revenue";
  if (url.includes("/funding-rounds")) return "funding";
  if (url.includes("/scenarios")) return "scenario";
  return "other";
}
