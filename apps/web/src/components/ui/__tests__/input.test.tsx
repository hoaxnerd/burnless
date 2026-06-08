import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../input";

describe("Input", () => {
  it("renders bare (no wrapper) when no label/hint/error", () => {
    render(<Input aria-label="Bare" placeholder="type here" />);
    const input = screen.getByLabelText("Bare");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
    // canonical control style
    expect(input.className).toContain("rounded-xl");
    expect(input.className).toContain("border-surface-300");
  });

  it("wraps with a label when label is provided and wires htmlFor↔id", () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText("Email");
    const label = screen.getByText("Email");
    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.id).toBeTruthy();
  });

  it("applies disabled styling when disabled", () => {
    render(<Input label="Locked" disabled />);
    const input = screen.getByLabelText("Locked");
    expect(input).toBeDisabled();
    expect(input.className).toContain("disabled:opacity-60");
    expect(input.className).toContain("disabled:cursor-not-allowed");
  });

  it("sets aria-invalid and danger border when error is present (wrapped)", () => {
    render(<Input label="Amount" error="Required" />);
    const input = screen.getByLabelText("Amount");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.className).toContain("border-danger-500");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-error`);
  });

  it("applies error styling in bare mode via the `invalid` prop", () => {
    render(<Input aria-label="Bare" invalid />);
    const input = screen.getByLabelText("Bare");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.className).toContain("border-danger-500");
  });

  it("renders required marker and wires aria-describedby to hint", () => {
    render(<Input label="Name" required hint="As on file" />);
    const input = screen.getByLabelText(/Name/);
    expect(input).toBeRequired();
    expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-hint`);
    expect(screen.getByText("As on file")).toBeInTheDocument();
  });

  it("forwards onChange", () => {
    const onChange = vi.fn();
    render(<Input label="X" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "hi" } });
    expect(onChange).toHaveBeenCalled();
  });
});
