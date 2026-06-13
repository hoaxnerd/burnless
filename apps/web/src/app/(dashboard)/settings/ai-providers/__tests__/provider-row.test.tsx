import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderRow } from "../provider-row";

const base = { id: "p1", companyId: "c1", name: "Anthropic", kind: "anthropic", baseUrl: null, apiKeyMode: "user_provided", headers: null, dropParams: null, enabled: true, isDefault: true, apiKeySet: true, modelCount: 3, defaultModelId: "claude-sonnet-4", createdAt: new Date(), updatedAt: new Date() };

describe("ProviderRow", () => {
  it("renders name, Default badge, model summary, Connected status when tested ok", () => {
    render(<ProviderRow provider={base as never} testState="ok" onToggle={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText(/claude-sonnet-4 · 3 models/)).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });
  it("toggle has role=switch reflecting enabled and fires onToggle", () => {
    const onToggle = vi.fn();
    render(<ProviderRow provider={base as never} testState="idle" onToggle={onToggle} onEdit={vi.fn()} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.click();
    expect(onToggle).toHaveBeenCalled();
  });
  it("custom provider shows the openai-compatible tag + baseUrl meta + Not tested", () => {
    const custom = { ...base, name: "Local · LM Studio", kind: "openai-compatible", baseUrl: "http://localhost:1234/v1", isDefault: false, defaultModelId: null, modelCount: 0 };
    render(<ProviderRow provider={custom as never} testState="idle" onToggle={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText("openai-compatible")).toBeInTheDocument();
    expect(screen.getByText(/localhost:1234/)).toBeInTheDocument();
    expect(screen.getByText("Not tested")).toBeInTheDocument();
  });
  it("fires onEdit when the edit button is clicked", () => {
    const onEdit = vi.fn();
    render(<ProviderRow provider={base as never} testState="idle" onToggle={vi.fn()} onEdit={onEdit} />);
    screen.getByRole("button", { name: /edit anthropic/i }).click();
    expect(onEdit).toHaveBeenCalled();
  });
});
