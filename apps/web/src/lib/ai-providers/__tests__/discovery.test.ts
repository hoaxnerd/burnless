import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchProviderModels } from "../discovery";

afterEach(() => vi.restoreAllMocks());

describe("fetchProviderModels", () => {
  it("parses an OpenAI-shaped /v1/models response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }) })) as unknown as typeof fetch);
    const models = await fetchProviderModels({ kind: "openai", baseUrl: undefined, apiKey: "sk" });
    expect(models.map((m) => m.modelId)).toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(models[0]!.source).toBe("fetched");
  });
  it("uses the configured baseUrl for openai-compatible endpoints + sends bearer auth", async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: "llama3" }] }) }));
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);
    await fetchProviderModels({ kind: "openai-compatible", baseUrl: "https://my.host/v1", apiKey: "k" });
    expect(spy).toHaveBeenCalledWith("https://my.host/v1/models", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer k" }),
    }));
  });
  it("strips a trailing slash on baseUrl before appending /models", async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);
    await fetchProviderModels({ kind: "openai-compatible", baseUrl: "https://my.host/v1/", apiKey: "k" });
    expect(spy).toHaveBeenCalledWith("https://my.host/v1/models", expect.anything());
  });
  it("falls back to catalog knownModels for anthropic (no /v1/models)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);
    const models = await fetchProviderModels({ kind: "anthropic", baseUrl: undefined, apiKey: "sk" });
    expect(spy).not.toHaveBeenCalled();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]!.source).toBe("preset");
  });
  it("throws a clear error on a non-ok discovery response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch);
    await expect(fetchProviderModels({ kind: "openai", baseUrl: undefined, apiKey: "bad" })).rejects.toThrow(/discovery failed/i);
  });
  it("throws when an openai-compatible kind has no base URL", async () => {
    await expect(fetchProviderModels({ kind: "openai-compatible", baseUrl: undefined, apiKey: "k" })).rejects.toThrow(/base url/i);
  });
});
