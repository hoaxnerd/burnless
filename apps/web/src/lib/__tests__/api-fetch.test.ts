import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiFetch } from "../api-fetch";

function clearScenarioCookie() {
  document.cookie = "active-scenario-id=; Path=/; Max-Age=0";
}

function lastHeaders(): Headers {
  const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1);
  return (call![1] as RequestInit).headers as Headers;
}

beforeEach(() => {
  clearScenarioCookie();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 }))
  );
});
afterEach(() => {
  clearScenarioCookie();
  vi.unstubAllGlobals();
});

describe("apiFetch — cookie is the single source of X-Scenario-Id", () => {
  it("injects the header from the cookie when a scenario is active", async () => {
    document.cookie = "active-scenario-id=20000000-0000-4000-a000-000000000200; Path=/";
    await apiFetch("/api/headcount/x", { method: "PATCH" });
    expect(lastHeaders().get("X-Scenario-Id")).toBe(
      "20000000-0000-4000-a000-000000000200"
    );
  });

  it("sends NO header when the cookie is absent", async () => {
    await apiFetch("/api/headcount/x", { method: "PATCH" });
    expect(lastHeaders().get("X-Scenario-Id")).toBeNull();
  });

  it("STRIPS a caller-provided header when the cookie is absent (the lock bug)", async () => {
    // Reproduces: a stale server-rendered scenarioId injected by a caller while
    // the cookie has been removed. Must NOT reach the server -> no 409.
    await apiFetch("/api/headcount/x", {
      method: "PATCH",
      headers: { "X-Scenario-Id": "20000000-0000-4000-a000-000000000200" },
    });
    expect(lastHeaders().get("X-Scenario-Id")).toBeNull();
  });

  it("overrides a caller-provided header to match the cookie", async () => {
    document.cookie = "active-scenario-id=cookie-wins; Path=/";
    await apiFetch("/api/headcount/x", {
      method: "PATCH",
      headers: { "X-Scenario-Id": "caller-stale" },
    });
    expect(lastHeaders().get("X-Scenario-Id")).toBe("cookie-wins");
  });
});
