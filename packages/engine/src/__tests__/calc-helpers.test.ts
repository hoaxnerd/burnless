import { describe, it, expect } from "vitest";
import {
  pctChange,
  ratioChange,
  pctOfTotal,
  ratioToPct,
  annualize,
} from "../calc-helpers";

describe("calc-helpers — single-source derived arithmetic", () => {
  describe("pctChange (month-over-month %, signed by |prev|)", () => {
    it("computes a positive increase", () => {
      expect(pctChange(110, 100)).toBe(10);
    });
    it("computes a decrease", () => {
      expect(pctChange(90, 100)).toBe(-10);
    });
    it("uses abs(prev) so a value rising from negative reads as a gain", () => {
      // -200 -> -100 is an improvement of +50% of the magnitude
      expect(pctChange(-100, -200)).toBe(50);
    });
    it("returns null when previous is 0 (undefined change)", () => {
      expect(pctChange(50, 0)).toBeNull();
    });
    it("is precise (no float drift)", () => {
      expect(pctChange(0.3, 0.1)).toBe(200);
    });
  });

  describe("ratioChange (fraction form of pctChange)", () => {
    it("returns a 0-1 fraction", () => {
      expect(ratioChange(110, 100)).toBeCloseTo(0.1, 10);
    });
    it("returns null when previous is 0", () => {
      expect(ratioChange(5, 0)).toBeNull();
    });
  });

  describe("pctOfTotal", () => {
    it("computes share of a total", () => {
      expect(pctOfTotal(25, 100)).toBe(25);
    });
    it("returns 0 when total is 0 (avoids divide-by-zero)", () => {
      expect(pctOfTotal(25, 0)).toBe(0);
    });
    it("is precise", () => {
      expect(pctOfTotal(1, 3)).toBeCloseTo(33.3333333, 5);
    });
  });

  describe("ratioToPct (0-1 rate -> 0-100 display)", () => {
    it("converts a churn rate", () => {
      expect(ratioToPct(0.04)).toBe(4);
    });
    it("is precise for awkward decimals", () => {
      expect(ratioToPct(0.011)).toBe(1.1);
    });
  });

  describe("annualize", () => {
    it("multiplies a monthly figure by 12", () => {
      expect(annualize(60000)).toBe(720000);
    });
  });
});
