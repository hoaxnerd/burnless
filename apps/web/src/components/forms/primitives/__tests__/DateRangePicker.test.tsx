import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangePicker } from "../DateRangePicker";

describe("DateRangePicker", () => {
  it("renders start and end inputs with given values", () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-12-31"
        onChange={() => {}}
      />,
    );
    expect((screen.getByLabelText(/start/i) as HTMLInputElement).value).toBe(
      "2026-01-01",
    );
    expect((screen.getByLabelText(/end/i) as HTMLInputElement).value).toBe(
      "2026-12-31",
    );
  });

  it("supports null endDate via 'no end date' checkbox", () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate={null}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /no end date/i })).toBeChecked();
  });

  it("calls onChange with both fields", () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate="2026-06-30"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/end/i), {
      target: { value: "2026-12-31" },
    });
    expect(onChange).toHaveBeenCalledWith({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });
});

describe("DateRangePicker hint prop", () => {
  it("renders hint text below the inputs when provided", () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate={null}
        onChange={() => {}}
        hint="Leave end date blank for ongoing items"
      />,
    );
    expect(
      screen.getByText("Leave end date blank for ongoing items"),
    ).toBeInTheDocument();
  });

  it("does not render any hint paragraph when hint is omitted", () => {
    render(
      <DateRangePicker
        startDate="2026-01-01"
        endDate={null}
        onChange={() => {}}
      />,
    );
    expect(
      screen.queryByText(/leave end date/i),
    ).not.toBeInTheDocument();
  });
});
