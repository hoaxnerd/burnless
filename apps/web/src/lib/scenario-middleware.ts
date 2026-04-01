/**
 * scenario-middleware — server-side helper that extracts the active
 * scenario from an incoming request and performs safety checks.
 *
 * For mutating requests (POST/PATCH/PUT/DELETE):
 *   If the `active-scenario-id` cookie is present but the
 *   `X-Scenario-Id` header is missing, a warning is logged.
 *   This will become a hard 409 rejection after Task 8 migrates
 *   all frontend fetch calls to use apiFetch.
 *
 * Returns the scenario ID from the header, or null when no
 * scenario is active.
 */
export function getActiveScenario(request: Request): string | null {
  const header = request.headers.get("X-Scenario-Id");
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookie = parseCookie(cookieHeader, "active-scenario-id");

  const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(
    request.method
  );

  if (cookie && !header && isMutation) {
    // Log-only for now — will become hard 409 after Task 8 apiFetch migration
    console.warn(
      "[scenario-safety] Scenario active (cookie) but X-Scenario-Id header missing on",
      request.method,
      request.url
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
