import { describe, it, expect } from "vitest";
import {
  sanitizeCallback,
  isAuthPage,
  isExcludedFromAutoLogin,
  isNavigationRequest,
  decideAutoLogin,
  NO_AUTOLOGIN_COOKIE,
} from "../auto-login";

describe("sanitizeCallback", () => {
  it("keeps a same-origin path", () => {
    expect(sanitizeCallback("/dashboard")).toBe("/dashboard");
    expect(sanitizeCallback("/expenses?month=2026-06")).toBe("/expenses?month=2026-06");
  });
  it("rejects protocol-relative + absolute URLs", () => {
    expect(sanitizeCallback("//evil.com")).toBe("/dashboard");
    expect(sanitizeCallback("https://evil.com")).toBe("/dashboard");
  });
  it("rejects null/empty", () => {
    expect(sanitizeCallback(null)).toBe("/dashboard");
    expect(sanitizeCallback("")).toBe("/dashboard");
  });
  it("sends auth pages to /dashboard (don't bounce back to login)", () => {
    expect(sanitizeCallback("/login")).toBe("/dashboard");
    expect(sanitizeCallback("/login?x=1")).toBe("/dashboard");
  });
});

describe("isNavigationRequest", () => {
  it("true for sec-fetch-mode navigate", () => {
    expect(isNavigationRequest("navigate", null)).toBe(true);
  });
  it("false for non-navigate sec-fetch-mode (e.g. cors/fetch)", () => {
    expect(isNavigationRequest("cors", "text/html")).toBe(false);
  });
  it("falls back to Accept text/html when sec-fetch-mode absent", () => {
    expect(isNavigationRequest(null, "text/html,application/xhtml+xml")).toBe(true);
    expect(isNavigationRequest(null, "application/json")).toBe(false);
  });
});

describe("isExcludedFromAutoLogin", () => {
  it("excludes api/_next/mcp/static", () => {
    expect(isExcludedFromAutoLogin("/api/auth/session")).toBe(true);
    expect(isExcludedFromAutoLogin("/_next/static/chunk.js")).toBe(true);
    expect(isExcludedFromAutoLogin("/mcp")).toBe(true);
    expect(isExcludedFromAutoLogin("/logo.svg")).toBe(true);
  });
  it("does not exclude app pages", () => {
    expect(isExcludedFromAutoLogin("/dashboard")).toBe(false);
    expect(isExcludedFromAutoLogin("/onboarding")).toBe(false);
    expect(isExcludedFromAutoLogin("/login")).toBe(false);
  });
});

describe("decideAutoLogin (edge-case matrix §5.2)", () => {
  const base = { autoLogin: true, hasToken: false, suppressed: false, isNavigation: true, pathname: "/dashboard", search: "" };

  it("#8 cloud (autoLogin off) → none", () => {
    expect(decideAutoLogin({ ...base, autoLogin: false }).action).toBe("none");
  });
  it("#1/#3 fresh nav, no token, not suppressed → redirect w/ callback", () => {
    expect(decideAutoLogin(base)).toEqual({ action: "redirect", callbackUrl: "/dashboard" });
  });
  it("#3 preserves deep-link path+search", () => {
    expect(decideAutoLogin({ ...base, pathname: "/expenses", search: "?m=1" }))
      .toEqual({ action: "redirect", callbackUrl: "/expenses?m=1" });
  });
  it("#4 /login nav → redirect with callback /dashboard", () => {
    expect(decideAutoLogin({ ...base, pathname: "/login" }))
      .toEqual({ action: "redirect", callbackUrl: "/dashboard" });
  });
  it("#5 suppressed + no token → none (login screen shows)", () => {
    expect(decideAutoLogin({ ...base, suppressed: true }).action).toBe("none");
  });
  it("#6 authed + stale suppression → clearSuppression", () => {
    expect(decideAutoLogin({ ...base, hasToken: true, suppressed: true }).action).toBe("clearSuppression");
  });
  it("#6 authed, no suppression → none", () => {
    expect(decideAutoLogin({ ...base, hasToken: true }).action).toBe("none");
  });
  it("#7 non-navigation (API/XHR) → none", () => {
    expect(decideAutoLogin({ ...base, isNavigation: false }).action).toBe("none");
  });
  it("excluded path → none", () => {
    expect(decideAutoLogin({ ...base, pathname: "/api/foo" }).action).toBe("none");
  });

  it("exports the cookie name", () => {
    expect(NO_AUTOLOGIN_COOKIE).toBe("burnless_no_autologin");
  });
});
