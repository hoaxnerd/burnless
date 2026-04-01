/**
 * apiFetch — drop-in replacement for fetch() that auto-injects the
 * active scenario ID header on every request.
 *
 * Reads `active-scenario-id` from cookie (set by ScenarioContext)
 * and forwards it as `X-Scenario-Id` so the backend can route
 * reads/writes to the correct scenario branch.
 */
export async function apiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const scenarioId = getScenarioCookie();
  const headers = new Headers(init?.headers);
  if (scenarioId) {
    headers.set("X-Scenario-Id", scenarioId);
  }
  return fetch(url, { ...init, headers });
}

function getScenarioCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)active-scenario-id=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
