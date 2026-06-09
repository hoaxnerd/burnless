import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconButton } from "../icon-button";

describe("IconButton", () => {
  it("exposes the required accessible name via aria-label", () => {
    render(<IconButton icon={<svg />} aria-label="Close panel" />);
    expect(screen.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
  });

  it("renders the provided icon", () => {
    render(<IconButton icon={<svg data-testid="the-icon" />} aria-label="Settings" />);
    expect(screen.getByTestId("the-icon")).toBeInTheDocument();
  });

  it("defaults to type=button", () => {
    render(<IconButton icon={<svg />} aria-label="Edit" />);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("type", "button");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(<IconButton icon={<svg />} aria-label="Run" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("respects disabled", () => {
    const onClick = vi.fn();
    render(<IconButton icon={<svg />} aria-label="Run" disabled onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
