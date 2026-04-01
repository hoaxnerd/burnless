/**
 * scenario-middleware — server-side helper that extracts the active
 * scenario from an incoming request and performs safety checks.
 *
 * For mutating requests (POST/PATCH/PUT/DELETE):
 *   If the `active-scenario-id` cookie is present but the
 *   `X-Scenario-Id` header is missing, a ScenarioSafetyError is thrown.
 *   API route error handlers should catch this and return 409 Conflict.
 *
 * Returns the scenario ID from the header, or null when no
 * scenario is active.
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

  if (cookie && !header && isMutation) {
    throw new ScenarioSafetyError(
      `Scenario active (cookie=${cookie}) but X-Scenario-Id header missing on ${request.method} ${request.url}`
    );
  }

  return header ?? null;
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
