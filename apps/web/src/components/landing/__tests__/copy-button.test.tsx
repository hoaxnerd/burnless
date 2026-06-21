import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton } from "../copy-button";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("CopyButton", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });
  it("copies the command to the clipboard and shows a copied state", async () => {
    render(<CopyButton command="curl -fsSL burnless.ai/install | sh" />);
    const btn = screen.getByRole("button", { name: /copy install command/i });
    fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("curl -fsSL burnless.ai/install | sh");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /copied install command/i })).toBeInTheDocument(),
    );
  });
});
