/**
 * S4a — pure auto-login decision helpers. No NextRequest/runtime deps so the
 * edge middleware logic is fully unit-testable. See spec §5.
 */
export const NO_AUTOLOGIN_COOKIE = "burnless_no_autologin";

const AUTH_PAGES = new Set(["/login"]);

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.has(pathname);
}

/** Same-origin path only. Rejects absolute/protocol-relative URLs and auth pages. */
export function sanitizeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (isAuthPage(raw.split("?")[0])) return "/dashboard";
  return raw;
}

/** Paths that must never trigger an auto-login redirect. */
export function isExcludedFromAutoLogin(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/mcp" ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname) // static asset with an extension
  );
}

/** A top-level navigation (document request) vs an API/XHR/fetch/RSC request. */
export function isNavigationRequest(secFetchMode: string | null, accept: string | null): boolean {
  if (secFetchMode) return secFetchMode === "navigate";
  return !!accept && accept.includes("text/html");
}

export type AutoLoginDecision =
  | { action: "redirect"; callbackUrl: string }
  | { action: "clearSuppression" }
  | { action: "none" };

export function decideAutoLogin(input: {
  autoLogin: boolean;
  hasToken: boolean;
  suppressed: boolean;
  isNavigation: boolean;
  pathname: string;
  search: string;
}): AutoLoginDecision {
  if (!input.autoLogin) return { action: "none" };
  if (input.hasToken) {
    return input.suppressed ? { action: "clearSuppression" } : { action: "none" };
  }
  if (input.suppressed || !input.isNavigation || isExcludedFromAutoLogin(input.pathname)) {
    return { action: "none" };
  }
  const callbackUrl = isAuthPage(input.pathname) ? "/dashboard" : input.pathname + input.search;
  return { action: "redirect", callbackUrl };
}
