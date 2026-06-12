import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EnableSwitch } from "../enable-switch";

/**
 * EnableSwitch — shared session-vs-permanent enablement control (S3b Task 8).
 *
 * The component is purely presentational + local prompt-state: it invokes the
 * caller's `onToggleSession` / `onKeepPermanently` callbacks and manages only
 * the visibility of the inline "Keep permanently" (`.savep`) prompt. Optimistic
 * mutate / rollback is the orchestrator's job (not tested here).
 */
function setup(overrides: Partial<React.ComponentProps<typeof EnableSwitch>> = {}) {
  const onToggleSession = vi.fn(async () => {});
  const onKeepPermanently = vi.fn(async () => {});
  const props = {
    enabled: true,
    isPermanentlyDisabled: false,
    conversationId: "chat-1" as string | null,
    sessionKey: "conn:c1",
    onToggleSession,
    onKeepPermanently,
    label: "Use Stripe in chat",
    ...overrides,
  };
  render(<EnableSwitch {...props} />);
  return { onToggleSession, onKeepPermanently };
}

describe("EnableSwitch (S3b Task 8)", () => {
  it("no conversation → toggle writes permanent directly, no prompt", async () => {
    const { onToggleSession, onKeepPermanently } = setup({ conversationId: null });
    fireEvent.click(screen.getByRole("switch", { name: "Use Stripe in chat" }));
    await waitFor(() => expect(onKeepPermanently).toHaveBeenCalledWith(true));
    expect(onToggleSession).not.toHaveBeenCalled();
    expect(screen.queryByText(/Keep it off in future chats/i)).toBeNull();
  });

  it("with conversation → toggle calls onToggleSession then shows the prompt", async () => {
    const { onToggleSession } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Use Stripe in chat" }));
    await waitFor(() => expect(onToggleSession).toHaveBeenCalledWith(true));
    expect(screen.getByText(/Keep it off in future chats/i)).toBeTruthy();
  });

  it("re-enabling a permanently-disabled tool for the session shows the 'on for this chat only' copy", async () => {
    // Permanently disabled (enabled=false, isPermanentlyDisabled=true). Toggling
    // it ON diverges the other way → the prompt offers to keep it ON permanently.
    const { onToggleSession } = setup({ enabled: false, isPermanentlyDisabled: true });
    fireEvent.click(screen.getByRole("switch", { name: "Use Stripe in chat" }));
    await waitFor(() => expect(onToggleSession).toHaveBeenCalledWith(false));
    expect(screen.getByText(/Keep it on in future chats/i)).toBeTruthy();
    expect(screen.queryByText(/Keep it off in future chats/i)).toBeNull();
  });

  it("re-enable prompt [Keep permanently] promotes onKeepPermanently(false)", async () => {
    const { onKeepPermanently } = setup({ enabled: false, isPermanentlyDisabled: true });
    fireEvent.click(screen.getByRole("switch", { name: "Use Stripe in chat" }));
    await waitFor(() => screen.getByText(/Keep it on in future chats/i));
    fireEvent.click(screen.getByRole("button", { name: /Keep permanently/i }));
    await waitFor(() => expect(onKeepPermanently).toHaveBeenCalledWith(false));
    await waitFor(() =>
      expect(screen.queryByText(/Keep it on in future chats/i)).toBeNull(),
    );
  });

  it("[Keep permanently] calls onKeepPermanently(true) and hides the prompt", async () => {
    const { onKeepPermanently } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Use Stripe in chat" }));
    await waitFor(() => screen.getByText(/Keep it off in future chats/i));
    fireEvent.click(screen.getByRole("button", { name: /Keep permanently/i }));
    await waitFor(() => expect(onKeepPermanently).toHaveBeenCalledWith(true));
    await waitFor(() =>
      expect(screen.queryByText(/Keep it off in future chats/i)).toBeNull(),
    );
  });

  it("dismiss hides the prompt without calling onKeepPermanently", async () => {
    const { onKeepPermanently } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Use Stripe in chat" }));
    await waitFor(() => screen.getByText(/Keep it off in future chats/i));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() =>
      expect(screen.queryByText(/Keep it off in future chats/i)).toBeNull(),
    );
    expect(onKeepPermanently).not.toHaveBeenCalled();
  });

  it("pin reflects isPermanentlyDisabled and toggles permanence on click", async () => {
    const { onKeepPermanently } = setup({ isPermanentlyDisabled: true });
    const pin = screen.getByRole("button", { name: /pin permanently/i });
    // permanent-on look: aria-pressed true
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pin);
    // diverges from permanent-on → promote to permanent-off
    await waitFor(() => expect(onKeepPermanently).toHaveBeenCalledWith(false));
  });
});
