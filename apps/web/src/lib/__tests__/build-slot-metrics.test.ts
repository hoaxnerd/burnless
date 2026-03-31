import { describe, it, expect } from "vitest";
import { buildSlotMetricCard, resolveSlotMetrics } from "../build-slot-metrics";
import type { ComputedMetrics } from "@burnless/engine";

const mockMetrics = {
  cashPosition: [
    { month: "2025-02", value: 900000 },
    { month: "2025-03", value: 1000000 },
  ],
  mrr: [
    { month: "2025-02", value: 45000 },
    { month: "2025-03", value: 50000 },
  ],
  grossMarginPercent: [
    { month: "2025-02", value: 60 },
    { month: "2025-03", value: 65 },
  ],
} as unknown as ComputedMetrics;

describe("buildSlotMetricCard", () => {
  it("formats a currency metric with MoM percentage change", () => {
    const card = buildSlotMetricCard("cashPosition", mockMetrics, "2025-03", "2025-02");

    expect(card.hasData).toBe(true);
    expect(card.value).toBe("$1.0M");
    // (1_000_000 - 900_000) / 900_000 * 100 = +11.1%
    expect(card.change).toBe("+11.1%");
    expect(card.changeLabel).toBe("vs last month");
    expect(card.label).toBe("Cash Position");
  });

  it("formats a percent metric with pp change", () => {
    const card = buildSlotMetricCard("grossMarginPercent", mockMetrics, "2025-03", "2025-02");

    expect(card.hasData).toBe(true);
    expect(card.value).toBe("65.0%");
    // diff = 65 - 60 = +5.0pp
    expect(card.change).toBe("+5.0pp");
    expect(card.changeLabel).toBe("vs last month");
  });

  it("returns ghost state for unknown slug (hasData=false, value='$---')", () => {
    const card = buildSlotMetricCard("nonExistentSlug", mockMetrics, "2025-03", "2025-02");

    expect(card.hasData).toBe(false);
    expect(card.value).toBe("$---");
    expect(card.change).toBeUndefined();
    expect(card.changeLabel).toBeUndefined();
  });

  it("returns ghost state when metric has no data for the requested month", () => {
    const card = buildSlotMetricCard("cashPosition", mockMetrics, "2025-04", "2025-03");

    expect(card.hasData).toBe(false);
    expect(card.value).toBe("$---");
    expect(card.sparkData).toBeUndefined();
  });

  it("includes metricStyle from registry (icon, color, href)", () => {
    const card = buildSlotMetricCard("cashPosition", mockMetrics, "2025-03", "2025-02");

    expect(card.metricStyle).toBeDefined();
    expect(typeof card.metricStyle?.icon).toBe("string");
    expect(typeof card.metricStyle?.color).toBe("string");
    expect(typeof card.metricStyle?.href).toBe("string");
    // cashPosition def has icon: "Wallet", color: "emerald", href: "/funding"
    expect(card.metricStyle?.icon).toBe("Wallet");
    expect(card.metricStyle?.color).toBe("emerald");
    expect(card.metricStyle?.href).toBe("/funding");
  });

  it("includes sparkData for known metrics with data", () => {
    const card = buildSlotMetricCard("cashPosition", mockMetrics, "2025-03", "2025-02");

    expect(Array.isArray(card.sparkData)).toBe(true);
    expect(card.sparkData).toEqual([900000, 1000000]);
  });

  it("sets slotId to provided slotId", () => {
    const card = buildSlotMetricCard("mrr", mockMetrics, "2025-03", "2025-02", "hero-1");

    expect(card.slotId).toBe("hero-1");
  });

  it("sets slotId to slug when no slotId provided", () => {
    const card = buildSlotMetricCard("mrr", mockMetrics, "2025-03", "2025-02");

    expect(card.slotId).toBe("mrr");
  });

  it("sets content type and slug correctly", () => {
    const card = buildSlotMetricCard("mrr", mockMetrics, "2025-03", "2025-02", "slot-0");

    expect(card.content).toEqual({ type: "metric", slug: "mrr" });
  });

  it("returns no change when prevVal is 0", () => {
    const metricsWithZeroPrev = {
      mrr: [
        { month: "2025-02", value: 0 },
        { month: "2025-03", value: 50000 },
      ],
    } as unknown as ComputedMetrics;

    const card = buildSlotMetricCard("mrr", metricsWithZeroPrev, "2025-03", "2025-02");

    expect(card.hasData).toBe(true);
    expect(card.change).toBeUndefined();
    expect(card.changeLabel).toBeUndefined();
  });
});

describe("resolveSlotMetrics", () => {
  const slots = [
    { id: "hero-0", defaultSlug: "cashPosition" },
    { id: "hero-1", defaultSlug: "mrr" },
  ];

  it("applies overrides correctly", () => {
    const overrides = {
      "dashboard:hero-0": { type: "metric", slug: "grossMarginPercent" },
    };

    const cards = resolveSlotMetrics(slots, overrides, "dashboard", mockMetrics, "2025-03", "2025-02");

    expect(cards[0]?.content.slug).toBe("grossMarginPercent");
    expect(cards[1]?.content.slug).toBe("mrr");
  });

  it("falls back to defaultSlug when no override", () => {
    const cards = resolveSlotMetrics(slots, {}, "dashboard", mockMetrics, "2025-03", "2025-02");

    expect(cards[0]?.content.slug).toBe("cashPosition");
    expect(cards[1]?.content.slug).toBe("mrr");
  });

  it("ignores overrides with type != 'metric'", () => {
    const overrides = {
      "dashboard:hero-0": { type: "chart", slug: "someChart" },
    };

    const cards = resolveSlotMetrics(slots, overrides, "dashboard", mockMetrics, "2025-03", "2025-02");

    // non-metric override is ignored, falls back to default
    expect(cards[0]?.content.slug).toBe("cashPosition");
  });

  it("uses pageId + slot.id as override key", () => {
    const overrides = {
      "expenses:hero-0": { type: "metric", slug: "grossMarginPercent" },
      "dashboard:hero-0": { type: "metric", slug: "mrr" },
    };

    const cards = resolveSlotMetrics(slots, overrides, "dashboard", mockMetrics, "2025-03", "2025-02");
    expect(cards[0]?.content.slug).toBe("mrr");

    const cardsExpenses = resolveSlotMetrics(slots, overrides, "expenses", mockMetrics, "2025-03", "2025-02");
    expect(cardsExpenses[0]?.content.slug).toBe("grossMarginPercent");
  });

  it("sets slotId on each resolved card", () => {
    const cards = resolveSlotMetrics(slots, {}, "dashboard", mockMetrics, "2025-03", "2025-02");

    expect(cards[0]?.slotId).toBe("hero-0");
    expect(cards[1]?.slotId).toBe("hero-1");
  });

  it("returns one card per slot", () => {
    const cards = resolveSlotMetrics(slots, {}, "dashboard", mockMetrics, "2025-03", "2025-02");

    expect(cards).toHaveLength(2);
  });
});
