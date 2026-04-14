import { describe, it, expect, vi, beforeEach } from "vitest";
import { canPerformAction } from "../feature-gate";

// Mock @burnless/ai so tests are isolated from plan config changes
vi.mock("@burnless/ai", () => {
  const plans: Record<string, object> = {
    free: {
      maxScenarios: 1,
      maxExports: 3,
      hasDataRoom: false,
      hasTeamAccess: false,
      hasCustomIntegrations: false,
      upgradeTarget: "pro",
    },
    pro: {
      maxScenarios: Infinity,
      maxExports: Infinity,
      hasDataRoom: true,
      hasTeamAccess: false,
      hasCustomIntegrations: false,
      upgradeTarget: "team",
    },
    team: {
      maxScenarios: Infinity,
      maxExports: Infinity,
      hasDataRoom: true,
      hasTeamAccess: true,
      hasCustomIntegrations: true,
      upgradeTarget: undefined,
    },
  };

  return {
    getPlan: (key: string) => plans[key] ?? plans["free"],
  };
});

describe("feature-gate", () => {
  describe("canPerformAction", () => {
    describe("create_scenario", () => {
      it("blocks free plan at limit", () => {
        const result = canPerformAction("free", "create_scenario", 1);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Your plan is limited to 1 scenario");
      });

      it("allows free plan under limit", () => {
        const result = canPerformAction("free", "create_scenario", 0);
        expect(result.allowed).toBe(true);
      });

      it("allows pro plan always", () => {
        const result = canPerformAction("pro", "create_scenario", 100);
        expect(result.allowed).toBe(true);
      });

      it("allows when no currentUsage provided", () => {
        const result = canPerformAction("free", "create_scenario");
        expect(result.allowed).toBe(true);
      });
    });

    describe("export", () => {
      it("blocks free plan at 3 exports", () => {
        const result = canPerformAction("free", "export", 3);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("3 exports per month");
      });

      it("allows free plan under 3 exports", () => {
        const result = canPerformAction("free", "export", 2);
        expect(result.allowed).toBe(true);
      });

      it("allows pro plan always", () => {
        const result = canPerformAction("pro", "export", 10000);
        expect(result.allowed).toBe(true);
      });
    });

    describe("data_room", () => {
      it("blocks free plan", () => {
        const result = canPerformAction("free", "data_room");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Pro feature");
      });

      it("allows pro plan", () => {
        const result = canPerformAction("pro", "data_room");
        expect(result.allowed).toBe(true);
      });
    });

    describe("team_access", () => {
      it("blocks free plan", () => {
        const result = canPerformAction("free", "team_access");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Team plan");
      });

      it("blocks pro plan", () => {
        const result = canPerformAction("pro", "team_access");
        expect(result.allowed).toBe(false);
      });

      it("allows team plan", () => {
        const result = canPerformAction("team", "team_access");
        expect(result.allowed).toBe(true);
      });
    });

    describe("custom_integrations", () => {
      it("blocks free plan", () => {
        const result = canPerformAction("free", "custom_integrations");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Team plan");
        expect(result.upgradeTarget).toBe("team");
      });

      it("blocks pro plan", () => {
        const result = canPerformAction("pro", "custom_integrations");
        expect(result.allowed).toBe(false);
        expect(result.upgradeTarget).toBe("team");
      });

      it("allows team plan", () => {
        const result = canPerformAction("team", "custom_integrations");
        expect(result.allowed).toBe(true);
      });
    });

    describe("upgradeTarget", () => {
      it("suggests pro for scenario limits (free plan)", () => {
        const result = canPerformAction("free", "create_scenario", 1);
        expect(result.upgradeTarget).toBe("pro");
      });

      it("suggests pro for export limits (free plan)", () => {
        const result = canPerformAction("free", "export", 3);
        expect(result.upgradeTarget).toBe("pro");
      });

      it("suggests pro for data room", () => {
        const result = canPerformAction("free", "data_room");
        expect(result.upgradeTarget).toBe("pro");
      });

      it("suggests team for team access", () => {
        const result = canPerformAction("free", "team_access");
        expect(result.upgradeTarget).toBe("team");
      });

      it("does not include upgradeTarget when allowed", () => {
        const result = canPerformAction("team", "custom_integrations");
        expect(result.upgradeTarget).toBeUndefined();
      });
    });

    describe("boundary conditions", () => {
      it("blocks at exact limit (not just above)", () => {
        const atLimit = canPerformAction("free", "export", 3);
        expect(atLimit.allowed).toBe(false);

        const belowLimit = canPerformAction("free", "export", 2);
        expect(belowLimit.allowed).toBe(true);
      });

      it("handles zero usage", () => {
        const result = canPerformAction("free", "export", 0);
        expect(result.allowed).toBe(true);
      });
    });
  });
});
