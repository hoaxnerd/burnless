/**
 * Pure parsing helpers for onboarding data.
 * Extracted from the API route for testability.
 */

import { z } from "zod";

/**
 * Slimmed onboarding payload (S4b wizard).
 *
 * The wizard creates the company FIRST via this route, then drives the REAL
 * per-domain endpoints for the detailed entities (revenue streams, funding,
 * headcount, expenses). So this route no longer accepts the old scalar
 * estimates (`monthly_revenue`/`team_size`/`funding`/`main_expenses`) nor the
 * AI-suggested detailed arrays — it only needs what describes the company.
 */
export const onboardingSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  stage: z.string().default("Pre-seed"),
  business_model: z.string().default("SaaS"),
  industry: z.string().optional(),
  user_name: z.string().optional(),
  founders: z.array(z.string()).optional().default([]),
  timezone: z.string().min(1).max(100).optional(),
});

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
