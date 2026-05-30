/**
 * apiFetch — drop-in replacement for fetch() that auto-injects the
 * active scenario ID header on every request.
 *
 * SINGLE SOURCE OF TRUTH: the `active-scenario-id` cookie. This is the same
 * value the server reads for SSR (`getServerScenarioId`) and for the
 * dual-channel safety check (`scenario-middleware`). Deriving the
 * `X-Scenario-Id` header from the cookie guarantees header and cookie can
 * never disagree, so callers must NEVER set `X-Scenario-Id` themselves — doing
 * so reintroduces a second, drift-prone source (a stale server-rendered prop or
 * a per-tab sessionStorage value) and causes spurious 409 ScenarioSafetyErrors.
 */
import { publishMutation, domainFromUrl } from "./mutation-bus";

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export async function apiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const scenarioId = getCookieScenarioId();
  const headers = new Headers(init?.headers);
  // Always reflect the cookie: set it when a scenario is active, and strip any
  // caller-provided value when it isn't (defensive — callers shouldn't set it).
  if (scenarioId) {
    headers.set("X-Scenario-Id", scenarioId);
  } else {
    headers.delete("X-Scenario-Id");
  }
  const res = await fetch(url, { ...init, headers });
  try {
    const method = (init?.method ?? "GET").toUpperCase();
    if (res.ok && MUTATING.has(method)) {
      publishMutation({ domain: domainFromUrl(url), method, at: Date.now() });
    }
  } catch {
    // Emitting must never affect the response.
  }
  return res;
}

function getCookieScenarioId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    /(?:^|;\s*)active-scenario-id=([^;]*)/
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
