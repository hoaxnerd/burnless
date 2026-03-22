import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "../chat-input";

describe("ChatInput", () => {
  const defaultProps = {
    input: "",
    isLoading: false,
    inputRef: { current: null },
    onInputChange: vi.fn(),
    onSubmit: vi.fn(),
  };

  it("renders input with placeholder", () => {
    render(<ChatInput {...defaultProps} />);
    expect(
      screen.getByPlaceholderText(/ask about your financials/i)
    ).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<ChatInput {...defaultProps} />);
    const btn = screen.getByRole("button", { name: "" });
    expect(btn).toBeInTheDocument();
  });

  it("disables input when loading", () => {
    render(<ChatInput {...defaultProps} isLoading={true} />);
    const input = screen.getByPlaceholderText(/ask about your financials/i);
    expect(input).toBeDisabled();
  });

  it("disables submit button when loading", () => {
    render(<ChatInput {...defaultProps} isLoading={true} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("disables submit button when input is empty", () => {
    render(<ChatInput {...defaultProps} input="" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("enables submit button when input has content and not loading", () => {
    render(<ChatInput {...defaultProps} input="What is my runway?" />);
    const btn = screen.getByRole("button");
    expect(btn).not.toBeDisabled();
  });

  it("calls onInputChange when typing", async () => {
    const onInputChange = vi.fn();
    render(<ChatInput {...defaultProps} onInputChange={onInputChange} />);
    const input = screen.getByPlaceholderText(/ask about your financials/i);
    await userEvent.type(input, "a");
    expect(onInputChange).toHaveBeenCalled();
  });

  it("calls onSubmit on form submission", async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<ChatInput {...defaultProps} input="test" onSubmit={onSubmit} />);
    const btn = screen.getByRole("button");
    await userEvent.click(btn);
    expect(onSubmit).toHaveBeenCalled();
  });

  it("displays current input value", () => {
    render(<ChatInput {...defaultProps} input="My query" />);
    const input = screen.getByPlaceholderText(/ask about your financials/i) as HTMLInputElement;
    expect(input.value).toBe("My query");
  });
});
