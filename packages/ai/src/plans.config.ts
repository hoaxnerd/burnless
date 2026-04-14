/**
 * Centralized plan configuration — single source of truth.
 *
 * ALL plan data lives here: pricing, limits, credits, display, enabled flags.
 * UIs import this for display. Enforcement logic imports this for limits.
 * Pricing values are display-only — actual billing uses payment provider price IDs.
 */

export type PlanKey = "free" | "pro" | "team";

export interface PlanDefinition {
  key: PlanKey;
  enabled: boolean;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  priceLabel: string;
  period: string;
  badge?: string;
  highlight: boolean;
  cta: string;
  ctaHref: string;
  maxScenarios: number;
  maxExports: number;
  hasDataRoom: boolean;
  hasTeamAccess: boolean;
  hasCustomIntegrations: boolean;
  monthlyAiCredits: number;
  features: string[];
  comparison: {
    scenarios: string;
    aiMessages: string;
    exports: string;
    bankSync: boolean;
    dashboards: boolean;
    reports: string;
    dataRoom: boolean;
    teamAccess: boolean;
    customIntegrations: boolean;
    support: string;
  };
  upgradeTarget?: PlanKey;
}

/** 1 USD = 1000 AI credits. Display/pricing constant for future credit purchasing. */
export const AI_CREDITS_PER_USD = 1000;

/**
 * Microdollars per credit. Used to convert ai_usage_logs.estimatedCostMicros to credits.
 * Derivation: 1 USD = 1,000,000 microdollars, 1 USD = 1,000 credits → 1 credit = 1,000 microdollars.
 */
export const MICROS_PER_CREDIT = 1000;

export const PLANS: readonly PlanDefinition[] = [
  {
    key: "free",
    enabled: true,
    name: "Free",
    description: "For founders getting started with runway planning.",
    monthlyPrice: 0,
    annualPrice: 0,
    priceLabel: "$0",
    period: "forever",
    highlight: false,
    cta: "Start free",
    ctaHref: "/login",
    maxScenarios: 1,
    maxExports: 3,
    hasDataRoom: false,
    hasTeamAccess: false,
    hasCustomIntegrations: false,
    monthlyAiCredits: 500,
    features: [
      "1 scenario",
      "500 AI credits / month",
      "3 exports / month",
      "CSV import",
    ],
    comparison: {
      scenarios: "1 scenario",
      aiMessages: "500 AI credits/mo",
      exports: "3 exports/mo",
      bankSync: true,
      dashboards: true,
      reports: "Basic reports",
      dataRoom: false,
      teamAccess: false,
      customIntegrations: false,
      support: "Community",
    },
    upgradeTarget: "pro",
  },
  {
    key: "pro",
    enabled: true,
    name: "Pro",
    description: "For founders who need unlimited planning power.",
    monthlyPrice: 29,
    annualPrice: 24,
    priceLabel: "$29",
    period: "/month",
    badge: "Most popular",
    highlight: true,
    cta: "Upgrade to Pro",
    ctaHref: "/login",
    maxScenarios: Infinity,
    maxExports: Infinity,
    hasDataRoom: true,
    hasTeamAccess: false,
    hasCustomIntegrations: false,
    monthlyAiCredits: 25_000,
    features: [
      "Unlimited scenarios",
      "25,000 AI credits / month",
      "PDF & CSV export",
      "Data room",
      "Priority support",
    ],
    comparison: {
      scenarios: "Unlimited scenarios",
      aiMessages: "25,000 AI credits/mo",
      exports: "Unlimited exports",
      bankSync: true,
      dashboards: true,
      reports: "Advanced reports + board updates",
      dataRoom: true,
      teamAccess: false,
      customIntegrations: false,
      support: "Priority email",
    },
    upgradeTarget: "team",
  },
  {
    key: "team",
    enabled: true,
    name: "Team",
    description: "For teams managing finances together.",
    monthlyPrice: 79,
    annualPrice: 66,
    priceLabel: "$79",
    period: "/month + $20/seat",
    highlight: false,
    cta: "Upgrade to Team",
    ctaHref: "/login",
    maxScenarios: Infinity,
    maxExports: Infinity,
    hasDataRoom: true,
    hasTeamAccess: true,
    hasCustomIntegrations: true,
    monthlyAiCredits: 100_000,
    features: [
      "Everything in Pro",
      "100,000 AI credits / month",
      "Team collaboration",
      "Role-based access",
      "Audit log",
      "Custom integrations",
    ],
    comparison: {
      scenarios: "Unlimited scenarios",
      aiMessages: "100,000 AI credits/mo",
      exports: "Unlimited exports",
      bankSync: true,
      dashboards: true,
      reports: "Advanced reports + board updates",
      dataRoom: true,
      teamAccess: true,
      customIntegrations: true,
      support: "Dedicated support",
    },
  },
] as const;

/** Get all enabled plans (for UIs — hides disabled plans from new users). */
export function getEnabledPlans(): PlanDefinition[] {
  return PLANS.filter((p) => p.enabled);
}

/** Get a plan by key. Returns the plan even if disabled (for enforcement of existing subscribers). */
export function getPlan(key: string): PlanDefinition {
  const plan = PLANS.find((p) => p.key === key);
  if (!plan) return PLANS[0]!; // fallback to free
  return plan;
}

/** Get plan limits for enforcement. */
export function getPlanLimits(key: string) {
  const plan = getPlan(key);
  return {
    maxScenarios: plan.maxScenarios,
    maxExports: plan.maxExports,
    hasDataRoom: plan.hasDataRoom,
    hasTeamAccess: plan.hasTeamAccess,
    hasCustomIntegrations: plan.hasCustomIntegrations,
    monthlyAiCredits: plan.monthlyAiCredits,
  };
}
