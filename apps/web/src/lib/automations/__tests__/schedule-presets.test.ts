import { describe, it, expect } from "vitest";
import { presetToCron, cronToPreset, describeCron } from "../schedule-presets";

describe("presetToCron", () => {
  it("daily at hour", () => expect(presetToCron({ kind: "daily", hour: 8, minute: 0 })).toBe("0 8 * * *"));
  it("weekly Mon", () => expect(presetToCron({ kind: "weekly", hour: 9, minute: 0, weekday: 1 })).toBe("0 9 * * 1"));
  it("monthly day 1", () => expect(presetToCron({ kind: "monthly", hour: 7, minute: 0, day: 1 })).toBe("0 7 1 * *"));
});
describe("cronToPreset", () => {
  it("recognizes a weekly cron", () => expect(cronToPreset("0 9 * * 1")).toMatchObject({ kind: "weekly", hour: 9, weekday: 1 }));
  it("returns null for an irregular cron", () => expect(cronToPreset("*/5 9-17 * * 1-5")).toBeNull());
});
describe("describeCron", () => {
  it("humanizes a known preset", () => expect(describeCron("0 9 * * 1")).toMatch(/Monday/i));
  it("falls back to the raw cron for custom", () => expect(describeCron("*/5 * * * *")).toContain("*/5"));
});
