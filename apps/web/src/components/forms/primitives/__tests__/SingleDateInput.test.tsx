import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SingleDateInput } from "../SingleDateInput";

describe("SingleDateInput (Phase 4 D)", () => {
  it("renders label and ISO date value", () => {
    render(<SingleDateInput label="Close date" value="2026-09-01" onChange={() => {}} />);
    expect(screen.getByLabelText("Close date")).toHaveValue("2026-09-01");
  });

  it("emits onChange with the new ISO date", () => {
    const onChange = vi.fn();
    render(<SingleDateInput label="Close date" value="2026-09-01" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Close date"), { target: { value: "2026-10-15" } });
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
  });

  it("supports required + disabled + hint props (kit-uniform)", () => {
    render(
      <SingleDateInput
        label="Effective date"
        value=""
        onChange={() => {}}
        required
        disabled
        hint="Defaults to today"
      />,
    );
    const input = screen.getByLabelText(/Effective date/);
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
    expect(screen.getByText("Defaults to today")).toBeInTheDocument();
  });
});
