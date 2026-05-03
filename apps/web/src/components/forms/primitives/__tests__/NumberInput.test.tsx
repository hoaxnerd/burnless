import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberInput } from "../NumberInput";

describe("NumberInput", () => {
  it("renders the value in the input", () => {
    render(<NumberInput value={42} onChange={() => {}} label="Units" />);
    const input = screen.getByLabelText("Units") as HTMLInputElement;
    expect(input.value).toBe("42");
  });

  it("calls onChange with a number when the user types a value", () => {
    const onChange = vi.fn();
    render(<NumberInput value={null} onChange={onChange} label="Units" />);
    fireEvent.change(screen.getByLabelText("Units"), {
      target: { value: "100" },
    });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it("calls onChange with null when the input is cleared", () => {
    const onChange = vi.fn();
    render(<NumberInput value={42} onChange={onChange} label="Units" />);
    fireEvent.change(screen.getByLabelText("Units"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("truncates fractional input when integerOnly is true (3.5 → 3)", () => {
    const onChange = vi.fn();
    render(
      <NumberInput value={null} onChange={onChange} label="Seats" integerOnly />,
    );
    fireEvent.change(screen.getByLabelText("Seats"), {
      target: { value: "3.5" },
    });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("clamps value to min when below min", () => {
    const onChange = vi.fn();
    render(
      <NumberInput value={null} onChange={onChange} label="Units" min={1} />,
    );
    fireEvent.change(screen.getByLabelText("Units"), {
      target: { value: "0" },
    });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("clamps value to max when above max", () => {
    const onChange = vi.fn();
    render(
      <NumberInput value={null} onChange={onChange} label="Units" max={10} />,
    );
    fireEvent.change(screen.getByLabelText("Units"), {
      target: { value: "50" },
    });
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("renders null value as empty string in the input", () => {
    render(<NumberInput value={null} onChange={() => {}} label="Units" />);
    const input = screen.getByLabelText("Units") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("renders the hint text when provided", () => {
    render(
      <NumberInput
        value={null}
        onChange={() => {}}
        label="Units"
        hint="Enter a whole number"
      />,
    );
    expect(screen.getByText("Enter a whole number")).toBeTruthy();
  });
});
