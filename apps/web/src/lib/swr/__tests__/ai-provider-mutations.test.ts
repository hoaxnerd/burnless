import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("swr", async (o) => ({ ...(await o<typeof import("swr")>()), mutate: vi.fn() }));
import { apiFetch } from "@/lib/api-fetch";
import { createAiProvider, updateAiProvider, deleteAiProvider, setDefaultAiProvider, testAiProvider, fetchAiProviderModels, addAiProviderModel, setDefaultAiProviderModel } from "../mutations";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("ai provider mutations", () => {
  it("createAiProvider POSTs to the list endpoint and returns the provider", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ provider: { id: "p1" } }));
    const r = await createAiProvider({ name: "A", kind: "openai", apiKey: "k" });
    expect(apiFetch).toHaveBeenCalledWith("/api/ai-features/providers", expect.objectContaining({ method: "POST" }));
    expect(r.provider.id).toBe("p1");
  });
  it("updateAiProvider PATCHes /[id]", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ provider: { id: "p1" } }));
    await updateAiProvider("p1", { name: "B" });
    expect(apiFetch).toHaveBeenCalledWith("/api/ai-features/providers/p1", expect.objectContaining({ method: "PATCH" }));
  });
  it("deleteAiProvider DELETEs /[id]", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ ok: true }));
    await deleteAiProvider("p1");
    expect(apiFetch).toHaveBeenCalledWith("/api/ai-features/providers/p1", expect.objectContaining({ method: "DELETE" }));
  });
  it("setDefaultAiProvider POSTs /[id]/default", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ ok: true }));
    await setDefaultAiProvider("p1");
    expect(apiFetch).toHaveBeenCalledWith("/api/ai-features/providers/p1/default", expect.objectContaining({ method: "POST" }));
  });
  it("testAiProvider returns the parsed result WITHOUT throwing on ok:false (400)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: false, status: 400, json: async () => ({ ok: false, error: "bad key" }) } as Response);
    const r = await testAiProvider("p1");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("bad key");
  });
  it("fetchAiProviderModels POSTs /[id]/models/fetch", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ models: [], fetched: 0 }));
    await fetchAiProviderModels("p1");
    expect(apiFetch).toHaveBeenCalledWith("/api/ai-features/providers/p1/models/fetch", expect.objectContaining({ method: "POST" }));
  });
  it("addAiProviderModel POSTs /[id]/models with the body", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ model: { id: "m1" } }));
    await addAiProviderModel("p1", { modelId: "gpt-4o", isDefault: true });
    expect(apiFetch).toHaveBeenCalledWith("/api/ai-features/providers/p1/models", expect.objectContaining({ method: "POST" }));
  });
});

// Reference setDefaultAiProviderModel so its import is exercised by type-check.
void setDefaultAiProviderModel;
