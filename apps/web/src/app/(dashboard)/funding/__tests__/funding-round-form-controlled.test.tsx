import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FundingRoundForm } from "../funding-round-form";

describe("FundingRoundForm (controlled)", () => {
  it("calls onSubmit with the normalized payload instead of fetching", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<FundingRoundForm mode="add" onSubmit={onSubmit} onClose={onClose} initial={{ name: "Seed", roundType: "seed", amount: 1000000 }} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.name).toBe("Seed");
    expect(payload.roundType).toBe("seed"); // present on add
    expect(payload.amount).toBe(1000000);
  });
});
