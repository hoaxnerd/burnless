import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "../textarea";

describe("Textarea", () => {
  it("renders the canonical control style", () => {
    render(<Textarea label="Notes" />);
    const ta = screen.getByLabelText("Notes");
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta.className).toContain("rounded-xl");
    expect(ta.className).toContain("border-surface-300");
  });

  it("applies disabled styling", () => {
    render(<Textarea label="Notes" disabled />);
    const ta = screen.getByLabelText("Notes");
    expect(ta).toBeDisabled();
    expect(ta.className).toContain("disabled:opacity-60");
  });

  it("sets aria-invalid + danger border on error", () => {
    render(<Textarea label="Notes" error="Required" />);
    const ta = screen.getByLabelText("Notes");
    expect(ta.getAttribute("aria-invalid")).toBe("true");
    expect(ta.className).toContain("border-danger-500");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("forwards onChange", () => {
    const onChange = vi.fn();
    render(<Textarea label="Notes" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "hello" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("renders bare for inline use", () => {
    render(<Textarea aria-label="Inline" />);
    expect(screen.getByLabelText("Inline").tagName).toBe("TEXTAREA");
  });
});
