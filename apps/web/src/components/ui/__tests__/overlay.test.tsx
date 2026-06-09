import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Overlay } from "../overlay";

describe("Overlay", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Overlay open={false} onClose={() => {}}>
        {(p) => <div {...p}>content</div>}
      </Overlay>,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders panel with dialog semantics when open (non-headless)", () => {
    render(
      <Overlay open onClose={() => {}} ariaLabel="My dialog">
        {(p) => <div {...p}>content</div>}
      </Overlay>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "My dialog");
    expect(dialog).toHaveAttribute("tabindex", "-1");
  });

  it("omits dialog ARIA in headless mode", () => {
    render(
      <Overlay open headless onClose={() => {}} ariaLabel="ignored">
        {(p) => <div {...p}>palette</div>}
      </Overlay>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const panel = screen.getByText("palette");
    expect(panel).not.toHaveAttribute("role");
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(panel).not.toHaveAttribute("tabindex");
  });

  it("closes on scrim click and on Escape", () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} ariaLabel="d">
        {(p) => <div {...p}>content</div>}
      </Overlay>,
    );
    const scrim = document.querySelector('[aria-hidden="true"]');
    fireEvent.click(scrim!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close when clicking inside the panel", () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} ariaLabel="d">
        {(p) => <div {...p}>inside</div>}
      </Overlay>,
    );
    fireEvent.click(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores on close", () => {
    const { rerender } = render(
      <Overlay open onClose={() => {}} ariaLabel="d">
        {(p) => <div {...p}>c</div>}
      </Overlay>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Overlay open={false} onClose={() => {}} ariaLabel="d">
        {(p) => <div {...p}>c</div>}
      </Overlay>,
    );
    expect(document.body.style.overflow).toBe("");
  });
});
