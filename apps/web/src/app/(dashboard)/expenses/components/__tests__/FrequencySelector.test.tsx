import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FrequencySelector } from "../FrequencySelector";

describe("FrequencySelector", () => {
  it("renders all three options", () => {
    render(<FrequencySelector value="monthly" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Quarterly" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Annual" })).toBeInTheDocument();
  });

  it("marks the active option with aria-checked=true", () => {
    render(<FrequencySelector value="quarterly" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Monthly" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Quarterly" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Annual" })).toHaveAttribute("aria-checked", "false");
  });

  it("fires onChange with 'monthly' when Monthly is clicked", () => {
    const onChange = vi.fn();
    render(<FrequencySelector value="quarterly" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(onChange).toHaveBeenCalledWith("monthly");
  });

  it("fires onChange with 'quarterly' when Quarterly is clicked", () => {
    const onChange = vi.fn();
    render(<FrequencySelector value="monthly" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Quarterly" }));
    expect(onChange).toHaveBeenCalledWith("quarterly");
  });

  it("fires onChange with 'annual' when Annual is clicked", () => {
    const onChange = vi.fn();
    render(<FrequencySelector value="monthly" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    expect(onChange).toHaveBeenCalledWith("annual");
  });

  it("does not fire onChange when disabled", () => {
    const onChange = vi.fn();
    render(<FrequencySelector value="monthly" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respects custom aria-label", () => {
    render(
      <FrequencySelector value="monthly" onChange={() => {}} aria-label="Billing cadence" />,
    );
    expect(screen.getByRole("radiogroup", { name: "Billing cadence" })).toBeInTheDocument();
  });
});
