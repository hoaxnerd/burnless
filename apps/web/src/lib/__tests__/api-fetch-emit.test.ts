import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "../api-fetch";
import * as bus from "../mutation-bus";

beforeEach(() => {
  vi.spyOn(bus, "publishMutation").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("apiFetch mutation emit", () => {
  it("emits on an ok mutating request", async () => {
    await apiFetch("/api/forecast-lines/1", { method: "PATCH" });
    expect(bus.publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "expenses", method: "PATCH" })
    );
  });

  it("does NOT emit on GET", async () => {
    await apiFetch("/api/forecast-lines/1");
    expect(bus.publishMutation).not.toHaveBeenCalled();
  });

  it("does NOT emit on a non-ok response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await apiFetch("/api/forecast-lines/1", { method: "DELETE" });
    expect(bus.publishMutation).not.toHaveBeenCalled();
  });

  it("does NOT emit for the insights regen POST (prevents the auto-regen loop)", async () => {
    await apiFetch("/api/insights", { method: "POST" });
    expect(bus.publishMutation).not.toHaveBeenCalled();
  });

  it("does NOT emit for non-financial endpoints (preferences, chat)", async () => {
    await apiFetch("/api/user-preferences", { method: "PATCH" });
    await apiFetch("/api/chat", { method: "POST" });
    expect(bus.publishMutation).not.toHaveBeenCalled();
  });

  it("emits for financial routes that map via other paths (accounts, imports)", async () => {
    await apiFetch("/api/accounts", { method: "POST" });
    expect(bus.publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "expenses", method: "POST" })
    );
  });
});
