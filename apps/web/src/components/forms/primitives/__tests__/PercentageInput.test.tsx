import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PercentageInput } from "../PercentageInput";

describe("PercentageInput", () => {
  it("renders value × 100 in the input", () => {
    render(
      <PercentageInput
        value={0.05}
        onChange={() => {}}
        label="Growth Rate"
      />,
    );
    const input = screen.getByLabelText("Growth Rate") as HTMLInputElement;
    expect(input.value).toBe("5");
  });

  it("onChange fires with value / 100", () => {
    const onChange = vi.fn();
    render(
      <PercentageInput
        value={0}
        onChange={onChange}
        label="Churn Rate"
      />,
    );
    fireEvent.change(screen.getByLabelText("Churn Rate"), {
      target: { value: "10" },
    });
    expect(onChange).toHaveBeenCalledWith(0.1);
  });

  it("clamps to max when value exceeds max (engine units)", () => {
    const onChange = vi.fn();
    render(
      <PercentageInput
        value={0.5}
        onChange={onChange}
        label="Rate"
        max={1}
      />,
    );
    fireEvent.change(screen.getByLabelText("Rate"), {
      target: { value: "150" },
    });
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
