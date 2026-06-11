import { getCapabilities } from "@/lib/capabilities";

/**
 * Pure server helper (Task 13). When `multiTenant` is off (self_host), personal
 * scope is meaningless (single user) — coerce to `company`. Cloud honors the
 * requested scope. The client also hides the toggle, but the server is the
 * authoritative coercion point.
 *
 * Lives in a sibling module (not `route.ts`) because the Next.js App Router only
 * permits HTTP-method + a fixed set of config exports from a route file — any
 * other export ("resolveOwnerScope") fails the production build.
 */
export function resolveOwnerScope(
  requested: "company" | "personal"
): "company" | "personal" {
  return getCapabilities().multiTenant ? requested : "company";
}
