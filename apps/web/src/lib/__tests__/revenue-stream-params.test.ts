/**
 * Contract test: form state → engine-compatible params.
 *
 * Guards against silent $0 regressions when form field names drift away
 * from the engine's expected parameter shape (historical bug: usage-based,
 * one-time, and services streams all silently computed $0 because form
 * output names did not match engine interface field names).
 *
 * The mapper accepts UI-facing field names (monthlyHours, monthlyUnits,
 * unitPrice, expectedUnits, monthlyChurnRate-as-percent) and returns
 * params in the shape `@burnless/engine` expects.
 */

import { describe, it, expect } from "vitest";
import { computeRevenueStream } from "@burnless/engine";
import { buildRevenueStreamParams } from "../revenue-stream-params";

const start = new Date(2026, 0, 1);
const end = new Date(2026, 2, 1); // Jan + Feb

describe("buildRevenueStreamParams → computeRevenueStream", () => {
  it("subscription form values produce non-zero MRR", () => {
    const params = buildRevenueStreamParams("subscription", {
      monthlyPrice: "50",
      startingCustomers: "100",
      newCustomersPerMonth: "10",
      monthlyChurnRate: "5", // UI enters percentage
    });
    const series = computeRevenueStream(
      { id: "s", name: "s", type: "subscription", parameters: params },
      start,
      end,
    );
    expect(series.get("2026-01")).toBe(5250);
  });

  it("subscription converts churn percentage to decimal", () => {
    const params = buildRevenueStreamParams("subscription", {
      monthlyPrice: "50",
      startingCustomers: "100",
      newCustomersPerMonth: "10",
      monthlyChurnRate: "5",
    });
    expect(params.monthlyChurnRate).toBe(0.05);
  });

  it("services form values produce non-zero revenue", () => {
    const params = buildRevenueStreamParams("services", {
      hourlyRate: "200",
      monthlyHours: "160",
    });
    const series = computeRevenueStream(
      { id: "s", name: "s", type: "services", parameters: params },
      start,
      end,
    );
    expect(series.get("2026-01")).toBe(32000);
  });

  it("services maps monthlyHours → engine's hoursPerMonth", () => {
    const params = buildRevenueStreamParams("services", {
      hourlyRate: "200",
      monthlyHours: "160",
    });
    expect(params.hoursPerMonth).toBe(160);
    expect(params.hourlyRate).toBe(200);
    expect("monthlyHours" in params).toBe(false);
  });

  it("one_time form values produce non-zero revenue", () => {
    const params = buildRevenueStreamParams("one_time", {
      unitPrice: "100",
      monthlyUnits: "50",
    });
    const series = computeRevenueStream(
      { id: "s", name: "s", type: "one_time", parameters: params },
      start,
      end,
    );
    expect(series.get("2026-01")).toBe(5000);
  });

  it("one_time maps unitPrice/monthlyUnits → engine's pricePerUnit/unitsPerMonth", () => {
    const params = buildRevenueStreamParams("one_time", {
      unitPrice: "100",
      monthlyUnits: "50",
    });
    expect(params.unitsPerMonth).toBe(50);
    expect(params.pricePerUnit).toBe(100);
    expect("unitPrice" in params).toBe(false);
    expect("monthlyUnits" in params).toBe(false);
  });

  it("usage_based form values produce non-zero revenue", () => {
    // UI has 2 inputs: "Expected Units/Mo" + "Price per Unit".
    // Engine expects 3 fields; we collapse by treating expectedUnits as
    // activeUsers with avgUsagePerUser = 1. Semantic: N units/month at
    // price X = N users × 1 unit each × X.
    const params = buildRevenueStreamParams("usage_based", {
      pricePerUnit: "0.01",
      expectedUnits: "100000",
    });
    const series = computeRevenueStream(
      { id: "s", name: "s", type: "usage_based", parameters: params },
      start,
      end,
    );
    expect(series.get("2026-01")).toBe(1000);
  });

  it("usage_based maps expectedUnits → engine's activeUsers with avgUsagePerUser=1", () => {
    const params = buildRevenueStreamParams("usage_based", {
      pricePerUnit: "0.01",
      expectedUnits: "100000",
    });
    expect(params.activeUsers).toBe(100000);
    expect(params.avgUsagePerUser).toBe(1);
    expect(params.pricePerUnit).toBe(0.01);
    expect("expectedUnits" in params).toBe(false);
  });
});
