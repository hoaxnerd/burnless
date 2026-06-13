import { describe, expect, it, vi } from "vitest";
import { verifyConnection } from "../local/ai-provider-ops";

describe("verifyConnection", () => {
  it("reports ok on a 200 from /v1/models", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const r = await verifyConnection({ baseUrl: "https://openrouter.ai/api/v1", apiKey: "k", fetchFn });
    expect(r.ok).toBe(true);
  });
  it("reports failure on a non-2xx", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const r = await verifyConnection({ baseUrl: "https://x/v1", apiKey: "bad", fetchFn });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/401/);
  });
  it("does not double-append /v1", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    await verifyConnection({ baseUrl: "https://openrouter.ai/api/v1", apiKey: "k", fetchFn });
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("https://openrouter.ai/api/v1/models");
  });
});
