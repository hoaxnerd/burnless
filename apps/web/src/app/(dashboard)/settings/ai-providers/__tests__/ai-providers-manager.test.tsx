import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const providers = { current: [] as unknown[] };
vi.mock("@/lib/swr", () => ({
  useAiProviders: () => ({ data: { providers: providers.current }, isLoading: false }),
  useAiProviderModels: () => ({ data: { models: [] }, isLoading: false }),
  updateAiProvider: vi.fn(async () => ({ provider: {} })),
  createAiProvider: vi.fn(async () => ({ provider: { id: "p1" } })),
  testAiProvider: vi.fn(async () => ({ ok: true })),
  fetchAiProviderModels: vi.fn(async () => ({ models: [], fetched: 0 })),
  addAiProviderModel: vi.fn(async () => ({ model: {} })),
  setDefaultAiProviderModel: vi.fn(async () => ({ model: {} })),
  deleteAiProvider: vi.fn(async () => {}),
  KEYS: { aiProviders: "/api/ai-features/providers", aiProvider: (id: string) => `/api/ai-features/providers/${id}`, aiProviderModels: (id: string) => `/api/ai-features/providers/${id}/models` },
}));
import { AiProvidersManager } from "../ai-providers-manager";

const p = { id: "p1", companyId: "c1", name: "Anthropic", kind: "anthropic", baseUrl: null, apiKeyMode: "user_provided", headers: null, dropParams: null, enabled: true, isDefault: true, apiKeySet: true, modelCount: 3, defaultModelId: "claude-sonnet-4", createdAt: new Date(), updatedAt: new Date() };

describe("AiProvidersManager", () => {
  it("shows the empty state with no providers", () => {
    providers.current = [];
    render(<AiProvidersManager />);
    expect(screen.getByText(/No AI provider connected/i)).toBeInTheDocument();
  });
  it("lists providers + the Add provider row", () => {
    providers.current = [p];
    render(<AiProvidersManager />);
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add provider/i })).toBeInTheDocument();
  });
  it("opens the modal from the empty-state button", () => {
    providers.current = [];
    render(<AiProvidersManager />);
    fireEvent.click(screen.getByRole("button", { name: /add your first provider/i }));
    expect(screen.getByText(/Add a provider/i)).toBeInTheDocument();
  });
  it("toggling a provider calls updateAiProvider with the flipped enabled", async () => {
    const swr = await import("@/lib/swr");
    providers.current = [p];
    render(<AiProvidersManager />);
    fireEvent.click(screen.getByRole("switch"));
    expect(swr.updateAiProvider).toHaveBeenCalledWith("p1", { enabled: false });
  });
});
