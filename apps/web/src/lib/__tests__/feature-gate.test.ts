import { describe, it, expect } from "vitest";
import { canPerformAction, getPlanLimits } from "../feature-gate";

describe("feature-gate", () => {
  describe("getPlanLimits", () => {
    it("returns correct free plan limits", () => {
      const limits = getPlanLimits("free");
      expect(limits.maxScenarios).toBe(3);
      expect(limits.maxAiMessages).toBe(10);
      expect(limits.maxExports).toBe(3);
      expect(limits.hasDataRoom).toBe(false);
      expect(limits.hasTeamAccess).toBe(false);
      expect(limits.hasCustomIntegrations).toBe(false);
    });

    it("returns correct pro plan limits", () => {
      const limits = getPlanLimits("pro");
      expect(limits.maxScenarios).toBe(Infinity);
      expect(limits.maxAiMessages).toBe(Infinity);
      expect(limits.maxExports).toBe(Infinity);
      expect(limits.hasDataRoom).toBe(true);
      expect(limits.hasTeamAccess).toBe(false);
    });

    it("returns correct team plan limits", () => {
      const limits = getPlanLimits("team");
      expect(limits.maxScenarios).toBe(Infinity);
      expect(limits.hasDataRoom).toBe(true);
      expect(limits.hasTeamAccess).toBe(true);
      expect(limits.hasCustomIntegrations).toBe(true);
    });
  });

  describe("canPerformAction", () => {
    describe("create_scenario", () => {
      it("blocks free plan at limit", () => {
        const result = canPerformAction("free", "create_scenario", 3);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Free plan");
      });

      it("allows free plan under limit", () => {
        const result = canPerformAction("free", "create_scenario", 2);
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

    describe("ai_message", () => {
      it("blocks free plan at 10 messages", () => {
        const result = canPerformAction("free", "ai_message", 10);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("10 AI messages");
      });

      it("allows free plan under 10 messages", () => {
        const result = canPerformAction("free", "ai_message", 9);
        expect(result.allowed).toBe(true);
      });

      it("allows pro plan unlimited", () => {
        const result = canPerformAction("pro", "ai_message", 10000);
        expect(result.allowed).toBe(true);
      });
    });

    describe("export", () => {
      it("blocks free plan at 3 exports", () => {
        const result = canPerformAction("free", "export", 3);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("3 exports");
      });

      it("allows free plan under 3 exports", () => {
        const result = canPerformAction("free", "export", 2);
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
      it("suggests pro for scenario limits", () => {
        const result = canPerformAction("free", "create_scenario", 3);
        expect(result.upgradeTarget).toBe("pro");
      });

      it("suggests pro for AI message limits", () => {
        const result = canPerformAction("free", "ai_message", 10);
        expect(result.upgradeTarget).toBe("pro");
      });

      it("suggests pro for export limits", () => {
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
        // Free plan: maxAiMessages = 10
        const atLimit = canPerformAction("free", "ai_message", 10);
        expect(atLimit.allowed).toBe(false);

        const belowLimit = canPerformAction("free", "ai_message", 9);
        expect(belowLimit.allowed).toBe(true);
      });

      it("handles zero usage", () => {
        const result = canPerformAction("free", "ai_message", 0);
        expect(result.allowed).toBe(true);
      });
    });
  });
});
