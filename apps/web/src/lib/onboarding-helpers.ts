/**
 * Pure parsing helpers for onboarding data.
 * Extracted from the API route for testability.
 */

import { z } from "zod";

export const onboardingSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  stage: z.string().default("Pre-seed"),
  business_model: z.string().default("SaaS"),
  monthly_revenue: z.string().optional().default("$0"),
  team_size: z.string().optional().default("1"),
  funding: z.string().optional().default("$0"),
  main_expenses: z.string().optional().default("General operations"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Map user-friendly stage names to enum values */
export function parseStage(
  input: string
): "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus" | "bootstrapped" {
  const lower = input.toLowerCase();
  if (lower.includes("series b") || lower.includes("b+")) return "series_b";
  if (lower.includes("series a")) return "series_a";
  if (lower.includes("series c")) return "series_c_plus";
  if (lower.includes("seed") && !lower.includes("pre")) return "seed";
  if (lower.includes("pre")) return "pre_seed";
  if (lower.includes("bootstrap") || lower.includes("self")) return "bootstrapped";
  return "pre_seed";
}

export function parseBusinessModel(
  input: string
): "saas" | "marketplace" | "ecommerce" | "services" | "hardware" | "other" {
  const lower = input.toLowerCase();
  if (lower.includes("saas") || lower.includes("subscription")) return "saas";
  if (lower.includes("market")) return "marketplace";
  if (lower.includes("ecom") || lower.includes("e-com")) return "ecommerce";
  if (lower.includes("service") || lower.includes("consult") || lower.includes("agency"))
    return "services";
  if (lower.includes("hardware") || lower.includes("physical")) return "hardware";
  return "other";
}

export function parseMoneyAmount(input: string): number {
  if (!input) return 0;
  const lower = input.toLowerCase().replace(/[,$\s]/g, "");
  if (lower === "0") return 0;
  const match = lower.match(/(\d+\.?\d*)\s*(m|k|million|thousand)?/);
  if (!match) return 0;
  let amount = parseFloat(match[1]!);
  const suffix = match[2];
  if (suffix === "m" || suffix === "million") amount *= 1_000_000;
  else if (suffix === "k" || suffix === "thousand") amount *= 1_000;
  return Math.round(amount);
}

export function parseTeamSize(input: string): number {
  const match = input.match(/(\d+)/);
  return match ? parseInt(match[1]!, 10) : 1;
}
