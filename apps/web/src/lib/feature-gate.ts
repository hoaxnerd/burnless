/**
 * Feature gating — checks subscription plan limits before allowing actions.
 * Reads all limits from the centralized plan config.
 * AI credits are enforced separately by ai-feature-flags.ts.
 */

import { getPlan, type PlanKey } from "@burnless/ai";

export type Plan = PlanKey;

export type GatedAction =
  | "create_scenario"
  | "export"
  | "data_room"
  | "team_access"
  | "custom_integrations";

export function canPerformAction(
  plan: Plan,
  action: GatedAction,
  currentUsage?: number
): { allowed: boolean; reason?: string; upgradeTarget?: Plan } {
  const def = getPlan(plan);

  switch (action) {
    case "create_scenario":
      if (currentUsage !== undefined && currentUsage >= def.maxScenarios) {
        return {
          allowed: false,
          reason: `Your plan is limited to ${def.maxScenarios} scenario${def.maxScenarios === 1 ? "" : "s"}. Upgrade to ${def.upgradeTarget === "pro" ? "Pro" : "Team"} for unlimited scenarios.`,
          upgradeTarget: def.upgradeTarget,
        };
      }
      return { allowed: true };

    case "export":
      if (currentUsage !== undefined && currentUsage >= def.maxExports) {
        return {
          allowed: false,
          reason: `Your plan is limited to ${def.maxExports} exports per month. Upgrade to Pro for unlimited exports.`,
          upgradeTarget: def.upgradeTarget,
        };
      }
      return { allowed: true };

    case "data_room":
      if (!def.hasDataRoom) {
        return {
          allowed: false,
          reason: "Data Room is a Pro feature. Upgrade to access investor data room.",
          upgradeTarget: "pro",
        };
      }
      return { allowed: true };

    case "team_access":
      if (!def.hasTeamAccess) {
        return {
          allowed: false,
          reason: "Team access requires a Team plan.",
          upgradeTarget: "team",
        };
      }
      return { allowed: true };

    case "custom_integrations":
      if (!def.hasCustomIntegrations) {
        return {
          allowed: false,
          reason: "Custom integrations require a Team plan.",
          upgradeTarget: "team",
        };
      }
      return { allowed: true };

    default:
      return { allowed: true };
  }
}
