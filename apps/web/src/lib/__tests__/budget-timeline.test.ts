/**
 * Test for `aggregateBudgetTimeline` — collapses per-line-item monthly
 * forecast series into a single company-wide budget timeline used by the
 * expenses-page chart overlay.
 */

import { describe, it, expect } from "vitest";
import { aggregateBudgetTimeline } from "../budget-timeline";

describe("aggregateBudgetTimeline", () => {
  it("sums per-line monthly series into a single timeline sorted by month", () => {
    const timeline = aggregateBudgetTimeline([
      {
        monthlySeries: [
          { month: "2026-02", value: 200 },
          { month: "2026-01", value: 100 },
        ],
      },
      {
        monthlySeries: [
          { month: "2026-01", value: 50 },
          { month: "2026-02", value: 75 },
        ],
      },
    ]);

    expect(timeline).toEqual([
      { month: "2026-01", value: 150 },
      { month: "2026-02", value: 275 },
    ]);
  });

  it("returns an empty array when no line items are provided", () => {
    expect(aggregateBudgetTimeline([])).toEqual([]);
  });

  it("handles line items with disjoint months", () => {
    const timeline = aggregateBudgetTimeline([
      { monthlySeries: [{ month: "2026-01", value: 100 }] },
      { monthlySeries: [{ month: "2026-03", value: 50 }] },
    ]);

    expect(timeline).toEqual([
      { month: "2026-01", value: 100 },
      { month: "2026-03", value: 50 },
    ]);
  });
});
