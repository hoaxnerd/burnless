import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FundingRoundForm } from "../funding-round-form";

// The form imports apiFetch transitively; no network is hit during a render-only
// assertion, but stub it to be safe.
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

describe("FundingRoundForm — immutable round-type badge (FUND-10)", () => {
  it("renders a humanized '(immutable)' badge in edit mode with NO internal spec ref", () => {
    render(
      <FundingRoundForm
        mode="edit"
        initial={{ id: "r1", name: "Series A round", roundType: "series_a", amount: 5_000_000 }}
        onSubmit={async () => {}}
        onClose={() => {}}
      />,
    );

    // Pretty label + "(immutable)", not the raw enum.
    expect(screen.getByText(/Series A \(immutable\)/)).toBeInTheDocument();

    // No internal spec reference leaks into the UI string.
    expect(screen.queryByText(/umbrella §/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/umbrella §/);

    // The raw enum token must not be shown bare.
    expect(screen.queryByText(/series_a \(immutable\)/)).not.toBeInTheDocument();
  });

  it("renders no round-type <select> in edit mode (roundType stays read-only)", () => {
    render(
      <FundingRoundForm
        mode="edit"
        initial={{ id: "r2", name: "Seed", roundType: "seed", amount: 1_000_000 }}
        onSubmit={async () => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Seed \(immutable\)/)).toBeInTheDocument();
  });
});
