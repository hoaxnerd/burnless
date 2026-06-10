/**
 * New-token modal (mockup §2): role-capped scope cards, mint POST, shown-once
 * state with the plaintext + warning, Done resets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: mockApiFetch }));
// Repo reality: useToast throws outside <ToastProvider>; component tests mock it
// (same pattern as your-mcp-tab.test.tsx).
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

import { NewTokenModal } from "../new-token-modal";

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        token: "bl_pat_8fKw2mQzT4vRnY7cXp1aJdHs6bGe3LfU",
        id: "tok-9",
        name: "Claude Desktop",
        lastFour: "3LfU",
        scopes: ["read", "write"],
        expiresAt: "2026-08-09T00:00:00.000Z",
        createdAt: "2026-06-11T00:00:00.000Z",
      }),
      { status: 201 }
    )
  );
});

describe("NewTokenModal", () => {
  it("viewer sees write/delete scope cards disabled (role cap)", () => {
    render(<NewTokenModal open onClose={vi.fn()} onMinted={vi.fn()} userRole="viewer" />);
    expect(screen.getByRole("checkbox", { name: "Read scope" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("checkbox", { name: "Write scope" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("checkbox", { name: "Delete scope" })).toHaveProperty("disabled", true);
  });

  it("mints and shows the token exactly once with the hash warning + snippets", async () => {
    const onMinted = vi.fn();
    render(<NewTokenModal open onClose={vi.fn()} onMinted={onMinted} userRole="owner" />);
    fireEvent.change(screen.getByLabelText(/Token name/i), { target: { value: "Claude Desktop" } });
    // Owner selects Write in addition to the default Read before minting.
    fireEvent.click(screen.getByRole("checkbox", { name: "Write scope" }));
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    await waitFor(() => {
      expect(screen.getByText("bl_pat_8fKw2mQzT4vRnY7cXp1aJdHs6bGe3LfU")).toBeTruthy();
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/api/tokens", expect.objectContaining({ method: "POST" }));
    const sent = JSON.parse((mockApiFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.name).toBe("Claude Desktop");
    expect(sent.scopes).toEqual(["read", "write"]);
    expect(sent.expiresInDays).toBe(60);
    expect(screen.getByText(/shown only once/i)).toBeTruthy();
    expect(screen.getByText(/We store only a hash/i)).toBeTruthy();
    expect(screen.getByText(/claude mcp add burnless/i)).toBeTruthy();
    expect(onMinted).toHaveBeenCalled();
  });

  it("delete scope card toggles on click for an owner", async () => {
    render(<NewTokenModal open onClose={vi.fn()} onMinted={vi.fn()} userRole="owner" />);
    const del = screen.getByRole("checkbox", { name: "Delete scope" });
    expect(del.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(del);
    expect(del.getAttribute("aria-checked")).toBe("true");
  });

  it("surfaces a server error without leaving the configure state", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Your role (viewer) cannot mint scopes: write" }), { status: 403 })
    );
    render(<NewTokenModal open onClose={vi.fn()} onMinted={vi.fn()} userRole="owner" />);
    fireEvent.change(screen.getByLabelText(/Token name/i), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("cannot mint");
    });
    expect(screen.getByRole("button", { name: "Create token" })).toBeTruthy();
  });
});
