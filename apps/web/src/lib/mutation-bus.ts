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

/**
 * Domains that represent financial data changes — the ones that should restale AI
 * insights and reset the grace countdown. Non-financial mutations (preferences,
 * accounts/departments admin, the insights regen POST itself) map to "other" and must
 * NOT reset the insight countdown, or the auto-regen would loop forever.
 */
export const FINANCIAL_DOMAINS = new Set([
  "expenses",
  "team",
  "revenue",
  "funding",
  "scenario",
]);

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

/** Test-only: clear subscribers so module-level state doesn't leak across tests. */
export function resetMutationBusForTesting(): void {
  handlers.clear();
}

export function domainFromUrl(url: string): string {
  if (url.includes("/forecast-lines") || url.includes("/transactions") ||
      url.includes("/import") || url.includes("/accounts")) return "expenses";
  if (url.includes("/headcount") || url.includes("/departments")) return "team";
  if (url.includes("/revenue-streams")) return "revenue";
  if (url.includes("/funding-rounds")) return "funding";
  if (url.includes("/scenarios")) return "scenario";
  // Non-financial (insights regen POST, chat, ai-config, preferences, …) → "other",
  // which apiFetch does NOT emit. Critically this keeps the insights regen POST out of
  // the bus, so auto-regen can't retrigger itself into an infinite loop.
  return "other";
}
