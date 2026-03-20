import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormField } from "../form-field";

// Mock @burnless/types formatNumber
vi.mock("@burnless/types", () => ({
  formatNumber: (num: number, _locale?: string) => num.toLocaleString("en-US"),
}));

describe("FormField", () => {
  it("renders label and input", () => {
    render(<FormField label="Email" placeholder="you@example.com" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("generates id from label when no id provided", () => {
    render(<FormField label="Company Name" />);
    const input = screen.getByLabelText("Company Name");
    expect(input.id).toBe("company-name");
  });

  it("uses provided id", () => {
    render(<FormField label="Email" id="custom-id" />);
    const input = screen.getByLabelText("Email");
    expect(input.id).toBe("custom-id");
  });

  it("calls onChange with value when typing", () => {
    const onChange = vi.fn();
    render(<FormField label="Name" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "test" },
    });
    expect(onChange).toHaveBeenCalledWith("test");
  });

  it("shows external error immediately", () => {
    render(<FormField label="Email" error="Invalid email" />);
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows validation error only after blur (touched)", () => {
    const validate = (v: string) => (v.length < 3 ? "Too short" : null);
    render(<FormField label="Name" validate={validate} />);

    const input = screen.getByLabelText("Name");

    // Type a short value - no error yet (not touched)
    fireEvent.change(input, { target: { value: "ab" } });
    expect(screen.queryByText("Too short")).not.toBeInTheDocument();

    // Blur to trigger validation
    fireEvent.blur(input);
    expect(screen.getByText("Too short")).toBeInTheDocument();
  });

  it("clears validation error when value becomes valid after blur", () => {
    const validate = (v: string) => (v.length < 3 ? "Too short" : null);
    render(<FormField label="Name" validate={validate} />);

    const input = screen.getByLabelText("Name");

    // Blur with short value to set error
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.blur(input);
    expect(screen.getByText("Too short")).toBeInTheDocument();

    // Type valid value - error should clear (already touched)
    fireEvent.change(input, { target: { value: "abc" } });
    expect(screen.queryByText("Too short")).not.toBeInTheDocument();
  });

  it("shows hint when no error", () => {
    render(<FormField label="Password" hint="At least 8 characters" />);
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
  });

  it("hides hint when error is shown", () => {
    render(
      <FormField label="Password" hint="At least 8 characters" error="Required" />
    );
    expect(screen.queryByText("At least 8 characters")).not.toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("applies error styling to input when error present", () => {
    render(<FormField label="Email" error="Invalid" />);
    const input = screen.getByLabelText("Email");
    expect(input.className).toContain("border-danger-500");
  });

  it("applies normal styling when no error", () => {
    render(<FormField label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input.className).toContain("border-surface-300");
  });
});
