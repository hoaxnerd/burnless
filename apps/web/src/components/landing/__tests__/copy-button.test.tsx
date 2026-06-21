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

  it("surfaces a failure when the clipboard is blocked (no silent swallow)", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
      writable: true,
    });
    render(<CopyButton command="curl -fsSL burnless.ai/install | sh" />);
    fireEvent.click(screen.getByRole("button", { name: /copy install command/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /couldn't copy/i })).toBeInTheDocument(),
    );
  });
});
