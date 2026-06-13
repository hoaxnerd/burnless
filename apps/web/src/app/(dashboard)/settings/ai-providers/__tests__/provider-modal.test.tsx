import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mut = vi.hoisted(() => ({
  createAiProvider: vi.fn(async () => ({ provider: { id: "p1" } })),
  updateAiProvider: vi.fn(async () => ({ provider: { id: "p1" } })),
  testAiProvider: vi.fn(async () => ({ ok: true, response: "hi" })),
  fetchAiProviderModels: vi.fn(async () => ({ models: [{ id: "m1", modelId: "gpt-4o", isDefault: false, enabled: true }], fetched: 1 })),
  addAiProviderModel: vi.fn(async () => ({ model: { id: "m1", modelId: "gpt-4o" } })),
  setDefaultAiProviderModel: vi.fn(async () => ({ model: { id: "m1" } })),
  deleteAiProvider: vi.fn(async () => {}),
}));
vi.mock("@/lib/swr", () => ({
  ...mut,
  useAiProviderModels: () => ({ data: { models: [] }, isLoading: false, mutate: vi.fn() }),
}));

import { ProviderModal } from "../provider-modal";

beforeEach(() => Object.values(mut).forEach((m) => m.mockClear?.()));

describe("ProviderModal — create", () => {
  it("shows the 8-tile catalog and prefills base URL on preset select", async () => {
    render(<ProviderModal open onClose={vi.fn()} provider={null} onSaved={vi.fn()} />);
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    fireEvent.click(screen.getByText("OpenRouter"));
    await waitFor(() => expect((screen.getByLabelText(/Base URL/i) as HTMLInputElement).value).toBe("https://openrouter.ai/api/v1"));
  });
  it("creates a provider on Save", async () => {
    const onSaved = vi.fn();
    render(<ProviderModal open onClose={vi.fn()} provider={null} onSaved={onSaved} />);
    fireEvent.click(screen.getByText("OpenAI"));
    fireEvent.change(screen.getByLabelText(/API key/i), { target: { value: "sk-test" } });
    fireEvent.click(screen.getByRole("button", { name: /save provider/i }));
    await waitFor(() => expect(mut.createAiProvider).toHaveBeenCalled());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
  it("surfaces a save error without closing the modal", async () => {
    mut.createAiProvider.mockRejectedValueOnce(new Error("boom"));
    const onClose = vi.fn();
    render(<ProviderModal open onClose={onClose} provider={null} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("OpenAI"));
    fireEvent.change(screen.getByLabelText(/API key/i), { target: { value: "sk-test" } });
    fireEvent.click(screen.getByRole("button", { name: /save provider/i }));
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ProviderModal — edit", () => {
  const provider = { id: "p1", companyId: "c1", name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKeyMode: "user_provided", headers: null, dropParams: null, enabled: true, isDefault: true, apiKeySet: true, modelCount: 1, defaultModelId: "claude-sonnet-4", createdAt: new Date(), updatedAt: new Date() };
  it("Test button calls testAiProvider", async () => {
    render(<ProviderModal open onClose={vi.fn()} provider={provider as never} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^test/i }));
    await waitFor(() => expect(mut.testAiProvider).toHaveBeenCalledWith("p1"));
  });
  it("Save updates the provider", async () => {
    const onSaved = vi.fn();
    render(<ProviderModal open onClose={vi.fn()} provider={provider as never} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /save provider/i }));
    await waitFor(() => expect(mut.updateAiProvider).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Anthropic" })));
  });
});
