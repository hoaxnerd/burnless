import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl, type SegmentedOption } from "../segmented-control";

const opts: SegmentedOption<"read" | "confirm" | "full">[] = [
  { value: "read", label: "Read only" },
  { value: "confirm", label: "Confirm" },
  { value: "full", label: "Full" },
];

describe("SegmentedControl", () => {
  it("renders a radiogroup with a label", () => {
    render(<SegmentedControl options={opts} value="read" onChange={() => {}} label="Write mode" />);
    expect(screen.getByRole("radiogroup", { name: "Write mode" })).toBeInTheDocument();
  });

  it("marks the selected option with aria-checked", () => {
    render(<SegmentedControl options={opts} value="confirm" onChange={() => {}} label="Write mode" />);
    const radios = screen.getAllByRole("radio");
    expect(radios.find((r) => r.getAttribute("aria-checked") === "true")).toHaveTextContent("Confirm");
    expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("uses roving tabindex (only selected is tabbable)", () => {
    render(<SegmentedControl options={opts} value="confirm" onChange={() => {}} label="Write mode" />);
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Confirm" })).toHaveAttribute("tabindex", "0");
  });

  it("calls onChange when a different option is clicked", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={opts} value="read" onChange={onChange} label="Write mode" />);
    fireEvent.click(screen.getByRole("radio", { name: "Full" }));
    expect(onChange).toHaveBeenCalledWith("full");
  });

  it("does not call onChange when clicking the already-selected option", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={opts} value="read" onChange={onChange} label="Write mode" />);
    fireEvent.click(screen.getByRole("radio", { name: "Read only" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves selection with arrow keys", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={opts} value="read" onChange={onChange} label="Write mode" />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("confirm");
  });
});
