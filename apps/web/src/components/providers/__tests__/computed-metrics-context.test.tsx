import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { ComputedMetricsProvider, useComputedMetrics, useOptionalComputedMetrics } from "../computed-metrics-context";
import type { ResolvedSlotData } from "@burnless/engine";

const mockSlotData: ResolvedSlotData[] = [
  {
    slotId: "hero-0",
    content: { type: "metric", slug: "cashPosition" },
    label: "Cash Position",
    value: "$1.0M",
    hasData: true,
  },
  {
    slotId: "hero-1",
    content: { type: "metric", slug: "mrr" },
    label: "MRR",
    value: "$50K",
    hasData: true,
    change: "+11.1%",
  },
];

describe("ComputedMetricsProvider", () => {
  it("provides slot data by slotId", () => {
    const { result } = renderHook(() => useComputedMetrics(), {
      wrapper: ({ children }) => (
        <ComputedMetricsProvider slotData={mockSlotData}>{children}</ComputedMetricsProvider>
      ),
    });
    expect(result.current.getSlot("hero-0")?.label).toBe("Cash Position");
  });

  it("provides slot data by metric slug", () => {
    const { result } = renderHook(() => useComputedMetrics(), {
      wrapper: ({ children }) => (
        <ComputedMetricsProvider slotData={mockSlotData}>{children}</ComputedMetricsProvider>
      ),
    });
    expect(result.current.getBySlug("mrr")?.value).toBe("$50K");
  });

  it("returns undefined for unknown slot", () => {
    const { result } = renderHook(() => useComputedMetrics(), {
      wrapper: ({ children }) => (
        <ComputedMetricsProvider slotData={mockSlotData}>{children}</ComputedMetricsProvider>
      ),
    });
    expect(result.current.getSlot("unknown")).toBeUndefined();
  });

  it("exposes all slots", () => {
    const { result } = renderHook(() => useComputedMetrics(), {
      wrapper: ({ children }) => (
        <ComputedMetricsProvider slotData={mockSlotData}>{children}</ComputedMetricsProvider>
      ),
    });
    expect(result.current.slots).toHaveLength(2);
  });

  it("throws outside provider", () => {
    expect(() => {
      renderHook(() => useComputedMetrics());
    }).toThrow("useComputedMetrics must be used within ComputedMetricsProvider");
  });

  it("optional hook returns null outside provider", () => {
    const { result } = renderHook(() => useOptionalComputedMetrics());
    expect(result.current).toBeNull();
  });
});
