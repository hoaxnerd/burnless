import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConfirmButton } from "../confirm-button";

describe("ConfirmButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("requires two clicks to confirm", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton icon={<svg />} label="Delete row" onConfirm={onConfirm} />);

    const btn = screen.getByRole("button", { name: "Delete row" });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(btn);
    // First click arms — no confirm yet, name + pressed state change.
    expect(onConfirm).not.toHaveBeenCalled();
    const armed = screen.getByRole("button", { name: "Confirm" });
    expect(armed).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(armed);
    expect(onConfirm).toHaveBeenCalledOnce();
    // Disarms after confirming.
    expect(screen.getByRole("button", { name: "Delete row" })).toHaveAttribute("aria-pressed", "false");
  });

  it("announces the armed state via aria-live", () => {
    render(<ConfirmButton icon={<svg />} label="Delete row" onConfirm={() => {}} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("");
    fireEvent.click(screen.getByRole("button", { name: "Delete row" }));
    expect(live).toHaveTextContent("Delete row armed");
  });

  it("auto-disarms after resetMs", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton icon={<svg />} label="Delete" onConfirm={onConfirm} resetMs={1000} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disarms on blur", () => {
    render(<ConfirmButton icon={<svg />} label="Delete" onConfirm={() => {}} />);
    const btn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    fireEvent.blur(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
