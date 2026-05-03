import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TieredPricingEditor } from "../TieredPricingEditor";

describe("TieredPricingEditor", () => {
  it("renders an empty state with an add button", () => {
    render(<TieredPricingEditor tiers={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no tiers yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add tier/i })).toBeInTheDocument();
  });

  it("calls onChange with a new tier when add is clicked", () => {
    const onChange = vi.fn();
    render(<TieredPricingEditor tiers={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add tier/i }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: expect.any(String), minUnits: 0, pricePerUnit: 0 }),
    ]);
  });

  it("removes a tier when × is clicked", () => {
    const onChange = vi.fn();
    render(
      <TieredPricingEditor
        tiers={[{ name: "A", minUnits: 0, maxUnits: 10, pricePerUnit: 5 }]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /remove tier 1/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows an inline error when tiers overlap", () => {
    render(
      <TieredPricingEditor
        tiers={[
          { name: "A", minUnits: 0, maxUnits: 10, pricePerUnit: 1 },
          { name: "B", minUnits: 5, maxUnits: 20, pricePerUnit: 1 },
        ]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/overlap/i);
  });

  it("notifies parent of validity transitions", () => {
    const onValidityChange = vi.fn();
    render(
      <TieredPricingEditor
        tiers={[{ name: "A", minUnits: 0, maxUnits: 10, pricePerUnit: 1 }]}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />
    );
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });
});
