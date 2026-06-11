import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { AiErrorStep } from "../ai-error-step";
describe("AiErrorStep", () => {
  it("fires retry / manual / later", () => {
    const onRetry = vi.fn(), onManual = vi.fn(), onLater = vi.fn();
    render(<AiErrorStep onRetry={onRetry} onManual={onManual} onLater={onLater} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i })); expect(onRetry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /enter details manually/i })); expect(onManual).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/i'?ll do this later/i)); expect(onLater).toHaveBeenCalled();
  });
});
