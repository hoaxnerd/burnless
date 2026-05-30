import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaleInsightBanner } from "../stale-insight-banner";

const base = { stale: false, staleReason: null, canRefresh: true, loading: false, onRefresh: () => {} };

describe("StaleInsightBanner live countdown", () => {
  it("renders M:SS while grace is active", () => {
    render(<StaleInsightBanner {...base} dataChanged graceRemaining={277_000} autoRegenerating={false} />);
    expect(screen.getByText(/4:37/)).toBeTruthy();
  });

  it("shows 'Updating insights…' while auto-regenerating", () => {
    render(<StaleInsightBanner {...base} dataChanged graceRemaining={0} autoRegenerating />);
    expect(screen.getByText(/Updating insights/i)).toBeTruthy();
  });
});
