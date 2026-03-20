/**
 * Feature gating middleware — checks subscription plan limits before
 * allowing actions. Used by API routes to enforce plan restrictions.
 *
 * For MVP, all features are unlocked. When Stripe is connected,
 * this will check actual subscription status.
 */

export type Plan = "free" | "pro" | "team";

export interface PlanLimits {
  maxScenarios: number;
  maxAiMessages: number;
  maxExports: number;
  hasDataRoom: boolean;
  hasTeamAccess: boolean;
  hasCustomIntegrations: boolean;
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxScenarios: 1,
    maxAiMessages: 10,
    maxExports: 3,
    hasDataRoom: false,
    hasTeamAccess: false,
    hasCustomIntegrations: false,
  },
  pro: {
    maxScenarios: Infinity,
    maxAiMessages: Infinity,
    maxExports: Infinity,
    hasDataRoom: true,
    hasTeamAccess: false,
    hasCustomIntegrations: false,
  },
  team: {
    maxScenarios: Infinity,
    maxAiMessages: Infinity,
    maxExports: Infinity,
    hasDataRoom: true,
    hasTeamAccess: true,
    hasCustomIntegrations: true,
  },
};

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canPerformAction(
  plan: Plan,
  action: "create_scenario" | "ai_message" | "export" | "data_room" | "team_access",
  currentUsage?: number
): { allowed: boolean; reason?: string } {
  const limits = PLAN_LIMITS[plan];

  switch (action) {
    case "create_scenario":
      if (currentUsage !== undefined && currentUsage >= limits.maxScenarios) {
        return {
          allowed: false,
          reason: `Free plan is limited to ${limits.maxScenarios} scenario. Upgrade to Pro for unlimited scenarios.`,
        };
      }
      return { allowed: true };

    case "ai_message":
      if (currentUsage !== undefined && currentUsage >= limits.maxAiMessages) {
        return {
          allowed: false,
          reason: `You've used all ${limits.maxAiMessages} AI messages this month. Upgrade to Pro for unlimited AI access.`,
        };
      }
      return { allowed: true };

    case "export":
      if (currentUsage !== undefined && currentUsage >= limits.maxExports) {
        return {
          allowed: false,
          reason: `Free plan is limited to ${limits.maxExports} exports per month. Upgrade to Pro for unlimited exports.`,
        };
      }
      return { allowed: true };

    case "data_room":
      if (!limits.hasDataRoom) {
        return {
          allowed: false,
          reason: "Data Room is a Pro feature. Upgrade to access investor data room.",
        };
      }
      return { allowed: true };

    case "team_access":
      if (!limits.hasTeamAccess) {
        return {
          allowed: false,
          reason: "Team access requires a Team plan.",
        };
      }
      return { allowed: true };

    default:
      return { allowed: true };
  }
}
