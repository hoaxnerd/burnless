/**
 * scenario-middleware — server-side helper that extracts the active
 * scenario from an incoming request and performs safety checks.
 *
 * Dual-channel validation:
 *   Channel 1: `active-scenario-id` cookie (set by ScenarioContext, auto-sent by browser)
 *   Channel 2: `X-Scenario-Id` header (set by apiFetch from sessionStorage)
 *
 * For mutating requests (POST/PATCH/PUT/DELETE):
 *   - If cookie is present but header is missing → ScenarioSafetyError (409)
 *   - If header is present but cookie is missing → ScenarioSafetyError (409)
 *   - If both present but values don't match → ScenarioSafetyError (409)
 *
 * Returns the scenario ID from the header, or null when no scenario is active.
 */

export class ScenarioSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioSafetyError";
  }
}

export function getActiveScenario(request: Request): string | null {
  const header = request.headers.get("X-Scenario-Id");
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookie = parseCookie(cookieHeader, "active-scenario-id");

  const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(
    request.method
  );

  if (isMutation) {
    // Both channels must agree on mutations
    if (cookie && !header) {
      throw new ScenarioSafetyError(
        `Scenario active (cookie=${cookie}) but X-Scenario-Id header missing on ${request.method} ${request.url}`
      );
    }
    if (header && !cookie) {
      throw new ScenarioSafetyError(
        `X-Scenario-Id header present (${header}) but cookie missing on ${request.method} ${request.url}`
      );
    }
    if (header && cookie && header !== cookie) {
      throw new ScenarioSafetyError(
        `Scenario channel mismatch: header=${header} cookie=${cookie} on ${request.method} ${request.url}`
      );
    }
  }

  return header ?? null;
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
