import { describe, expect, it } from "vitest";
import { computeAllForecastLines } from "../forecasting";

describe("forecast-line frequency honoring", () => {
  it("monthly frequency produces value every month", () => {
    const result = computeAllForecastLines(
      [
        {
          id: "f1", accountId: "a1",
          method: "fixed", parameters: { amount: 100 },
          startDate: new Date("2026-01-01"), endDate: null,
        },
      ],
      new Date("2026-01-01"), new Date("2026-04-01"),
    );
    const series = result.get("f1")!;
    expect(series.get("2026-01")).toBeCloseTo(100, 2);
    expect(series.get("2026-02")).toBeCloseTo(100, 2);
    expect(series.get("2026-03")).toBeCloseTo(100, 2);
  });

  // Engine-side frequency support is via startDate anchor; the following
  // lock-in test confirms a stream starting March 1 with no future cadence
  // gating still produces value March, April, May, etc. — the actual
  // "fire only on quarter anchor" gate lives in compute-expenses
  // post-aggregation, NOT in the engine. We document this distinction here.
  it("startDate anchors when the stream begins emitting", () => {
    const result = computeAllForecastLines(
      [
        {
          id: "f2", accountId: "a1",
          method: "fixed", parameters: { amount: 1200 },
          startDate: new Date("2026-03-01"), endDate: null,
        },
      ],
      new Date("2026-01-01"), new Date("2026-06-01"),
    );
    const series = result.get("f2")!;
    expect(series.get("2026-01")).toBe(0);
    expect(series.get("2026-02")).toBe(0);
    expect(series.get("2026-03")).toBeCloseTo(1200, 2);
  });
});
