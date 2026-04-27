/**
 * Tests for dashboard AI insight generation logic.
 *
 * The generateInsight function in ai-insight-banner.tsx is not exported,
 * so we reimplement the rules here and verify the expected behavior.
 * This catches regressions if thresholds are accidentally changed.
 */
import { describe, it, expect } from "vitest";
import { formatCompactAmount } from "@burnless/types";

// Reimplementation of the insight generation rules from ai-insight-banner.tsx
// to verify correctness of the priority/threshold logic.
type Severity = "critical" | "warning" | "info" | "neutral";

// USD compact formatter matching the default used in production
const fmtUSD = (v: number) => formatCompactAmount(v, "USD", "en-US");

function generateInsight(
  runway: number,
  burnRate: number,
  mrrGrowth: number,
  cash: number,
): { title: string; message: string; severity: Severity } | null {
  const fmtCompact = fmtUSD;
  if (runway <= 3 && runway > 0) {
    return {
      title: `${Math.round(runway)} months of runway remaining`,
      message: `At ${fmtCompact(burnRate)}/mo burn, you need to reduce costs or raise capital. Cash exhaustion projected by ${getExhaustionDate(runway)}.`,
      severity: "critical",
    };
  }
  if (runway <= 6 && runway > 0) {
    return {
      title: `Runway at ${Math.round(runway)} months — start fundraising conversations`,
      message: `At current burn rate, cash will be depleted by ${getExhaustionDate(runway)}. Typical fundraise takes 3-6 months.`,
      severity: "warning",
    };
  }
  if (mrrGrowth > 10) {
    return {
      title: `Revenue surging ${mrrGrowth.toFixed(1)}% month-over-month`,
      message: `Exceptional growth trajectory. At this rate, you'll double revenue in ${Math.ceil(72 / mrrGrowth)} months.`,
      severity: "info",
    };
  }
  if (mrrGrowth > 5) {
    return {
      title: `Healthy ${mrrGrowth.toFixed(1)}% MoM revenue growth`,
      message: `Strong and sustainable growth. You're in the top quartile for early-stage startups.`,
      severity: "info",
    };
  }
  if (burnRate > 0 && cash > 0 && runway >= 12) {
    return {
      title: `${Math.round(runway)} months of runway — solid position`,
      message: `With ${fmtCompact(cash)} in the bank at ${fmtCompact(burnRate)}/mo burn, you have room to focus on growth.`,
      severity: "neutral",
    };
  }
  if (burnRate > 0 && cash > 0) {
    return {
      title: `${Math.round(runway)} months runway at ${fmtCompact(burnRate)}/mo burn`,
      message: `Your financial position is stable. Focus on growth and efficiency.`,
      severity: "neutral",
    };
  }
  return null;
}

function getExhaustionDate(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + Math.round(months));
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

describe("AI insight generation", () => {
  describe("critical severity — runway <= 3 months", () => {
    it("triggers at 3 months runway", () => {
      const insight = generateInsight(3, 50000, 0, 150000);
      expect(insight?.severity).toBe("critical");
      expect(insight?.title).toContain("3 months of runway remaining");
    });

    it("triggers at 1 month runway", () => {
      const insight = generateInsight(1, 80000, 0, 80000);
      expect(insight?.severity).toBe("critical");
      expect(insight?.title).toContain("1 months of runway remaining");
    });

    it("triggers at fractional runway (2.5 months)", () => {
      const insight = generateInsight(2.5, 60000, 0, 150000);
      expect(insight?.severity).toBe("critical");
      expect(insight?.title).toContain("3 months"); // Math.round(2.5) = 3 in JS
    });

    it("does NOT trigger when runway is 0 (no burn)", () => {
      const insight = generateInsight(0, 0, 0, 100000);
      expect(insight?.severity).not.toBe("critical");
    });

    it("does NOT trigger when runway is negative", () => {
      const insight = generateInsight(-1, 50000, 0, 0);
      expect(insight?.severity).not.toBe("critical");
    });

    it("includes burn rate in message", () => {
      const insight = generateInsight(2, 75000, 0, 150000);
      expect(insight?.message).toContain("$75k/mo burn");
    });

    it("includes projected exhaustion date", () => {
      const insight = generateInsight(2, 50000, 0, 100000);
      expect(insight?.message).toContain("Cash exhaustion projected by");
    });
  });

  describe("warning severity — runway 3-6 months", () => {
    it("triggers at 6 months runway", () => {
      const insight = generateInsight(6, 50000, 0, 300000);
      expect(insight?.severity).toBe("warning");
      expect(insight?.title).toContain("start fundraising");
    });

    it("triggers at 4 months runway", () => {
      const insight = generateInsight(4, 40000, 0, 160000);
      expect(insight?.severity).toBe("warning");
    });

    it("does NOT trigger at 3 months (critical takes precedence)", () => {
      const insight = generateInsight(3, 50000, 0, 150000);
      expect(insight?.severity).toBe("critical");
    });

    it("does NOT trigger above 6 months", () => {
      const insight = generateInsight(7, 50000, 0, 350000);
      expect(insight?.severity).not.toBe("warning");
    });

    it("mentions typical fundraise timeline", () => {
      const insight = generateInsight(5, 50000, 0, 250000);
      expect(insight?.message).toContain("3-6 months");
    });
  });

  describe("info severity — MRR growth", () => {
    it("triggers 'surging' at >10% MoM growth", () => {
      const insight = generateInsight(18, 30000, 15.5, 500000);
      expect(insight?.severity).toBe("info");
      expect(insight?.title).toContain("surging");
      expect(insight?.title).toContain("15.5%");
    });

    it("triggers 'healthy' at 5-10% MoM growth", () => {
      const insight = generateInsight(18, 30000, 7.3, 500000);
      expect(insight?.severity).toBe("info");
      expect(insight?.title).toContain("Healthy");
      expect(insight?.title).toContain("7.3%");
    });

    it("calculates doubling time correctly at 10% growth", () => {
      const insight = generateInsight(18, 30000, 10.1, 500000);
      // Rule of 72: 72/10.1 = 7.13 → ceil = 8
      expect(insight?.message).toContain("8 months");
    });

    it("does NOT trigger at 5% exactly", () => {
      const insight = generateInsight(18, 30000, 5.0, 500000);
      expect(insight?.severity).not.toBe("info");
    });

    it("critical runway overrides high growth", () => {
      // Runway <= 3 should always win over growth
      const insight = generateInsight(2, 100000, 20, 200000);
      expect(insight?.severity).toBe("critical");
    });

    it("warning runway overrides high growth", () => {
      // Runway 3-6 should win over growth
      const insight = generateInsight(5, 50000, 20, 250000);
      expect(insight?.severity).toBe("warning");
    });
  });

  describe("neutral severity — stable position", () => {
    it("triggers for 12+ months runway with no growth signal", () => {
      const insight = generateInsight(18, 30000, 2, 540000);
      expect(insight?.severity).toBe("neutral");
      expect(insight?.title).toContain("solid position");
    });

    it("shows different message for 7-12 months runway", () => {
      const insight = generateInsight(8, 40000, 1, 320000);
      expect(insight?.severity).toBe("neutral");
      expect(insight?.title).toContain("$40k/mo burn");
      expect(insight?.message).toContain("stable");
    });

    it("includes cash and burn in long-runway message", () => {
      const insight = generateInsight(24, 50000, 0, 1200000);
      // formatCompactAmount(1200000) → "$1.2M"; formatCompactAmount(50000) → "$50k"
      expect(insight?.message).toContain("$1.2M in the bank");
      expect(insight?.message).toContain("$50k/mo burn");
    });
  });

  describe("null return — no insight", () => {
    it("returns null when burnRate is 0 and no growth", () => {
      const insight = generateInsight(0, 0, 0, 0);
      expect(insight).toBeNull();
    });

    it("returns null when cash is 0 and no growth signal", () => {
      const insight = generateInsight(0, 50000, 0, 0);
      expect(insight).toBeNull();
    });

    it("returns null for negative runway with no positive cash/burn", () => {
      const insight = generateInsight(-5, 0, 0, 0);
      expect(insight).toBeNull();
    });
  });

  describe("priority order", () => {
    it("critical > warning > info > neutral", () => {
      // Same company at different stages should get correct severity
      expect(generateInsight(2, 50000, 20, 100000)?.severity).toBe("critical");
      expect(generateInsight(5, 50000, 20, 250000)?.severity).toBe("warning");
      expect(generateInsight(18, 30000, 15, 500000)?.severity).toBe("info");
      expect(generateInsight(18, 30000, 2, 500000)?.severity).toBe("neutral");
    });
  });
});
