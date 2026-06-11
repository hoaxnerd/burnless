import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DraftCard } from "../draft-card";

describe("DraftCard", () => {
  it("renders title/meta/amount, shows AI accent, fires edit", () => {
    const onEdit = vi.fn();
    render(<DraftCard title="Pro plan" meta="120 customers" amount="$9,600/mo" ai onEdit={onEdit} />);
    expect(screen.getByText("Pro plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEdit).toHaveBeenCalled();
  });
});
