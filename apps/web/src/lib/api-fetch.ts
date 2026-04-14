/**
 * apiFetch — drop-in replacement for fetch() that auto-injects the
 * active scenario ID header on every request.
 *
 * Reads `active-scenario` from sessionStorage (set by ScenarioContext)
 * and forwards it as `X-Scenario-Id` so the backend can validate it
 * against the cookie channel.
 */
export async function apiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const scenarioId = getSessionScenarioId();
  const headers = new Headers(init?.headers);
  if (scenarioId) {
    headers.set("X-Scenario-Id", scenarioId);
  }
  return fetch(url, { ...init, headers });
}

function getSessionScenarioId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("active-scenario");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ?? null;
  } catch {
    return null;
  }
}
